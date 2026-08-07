# NoteTodo Open Platform Alpha

开放平台服务默认只监听 `127.0.0.1`，直接读取与桌面端相同的 SQLite 工作区。当前 Alpha 提供页面和数据库的最小稳定 REST 面，并为 Webhook、MCP Server 复用同一令牌协议。

## 启动

先在桌面端“设置 → 模型与 AI → API 访问令牌”签发令牌。明文只显示一次；SQLite 仅保存 SHA-256 摘要。

```powershell
$env:NOTETODO_DATABASE_PATH='C:\absolute\path\to\workspace.db'
$env:NOTETODO_API_PORT='4790'
npm run dev:api
```

不得把服务绑定到公网地址。需要远程访问时，应在具有 TLS、来源限制和额外身份认证的反向代理之后部署。

## 作用域

- `pages:read` / `pages:write`
- `databases:read` / `databases:write`
- `webhooks:manage`
- `automations:manage`

每个请求使用 `Authorization: Bearer <token>`。服务按令牌限制为每分钟 120 次请求；JSON 请求体上限为 1 MiB，页面正文持久化仍受桌面数据库的 20 MB 上限保护。

## 首批端点

| 方法 | 路径 | 作用域 |
| --- | --- | --- |
| `GET` | `/v1/health` | 无 |
| `GET` | `/v1/pages` | `pages:read` |
| `POST` | `/v1/pages` | `pages:write` |
| `GET` / `PATCH` | `/v1/pages/:pageId` | `pages:read` / `pages:write` |
| `GET` | `/v1/databases/by-page/:pageId` | `databases:read` |
| `PATCH` | `/v1/databases/records/:recordId/properties/:propertyId` | `databases:write` |

```powershell
$headers = @{ Authorization = "Bearer $env:NOTETODO_TOKEN" }
Invoke-RestMethod http://127.0.0.1:4790/v1/pages -Headers $headers
```

所有响应都包含 `requestId`，错误使用稳定的 `{ error: { code, message }, requestId }` 结构。SQLite 审计账本记录请求 ID、令牌 ID、方法、路径、状态和耗时，但不会记录 Authorization、正文或令牌明文。

## Webhook Outbox

桌面设置页可创建公网 HTTPS Webhook，订阅页面和数据库记录事件。签名密钥只显示一次，之后由 Windows DPAPI / macOS Keychain 加密保存。

投递请求包含：

- `X-NoteTodo-Delivery`：稳定的投递 ID，接收方应用于幂等。
- `X-NoteTodo-Event`：如 `page.updated`。
- `X-NoteTodo-Timestamp`：Unix 秒。
- `X-NoteTodo-Signature`：`v1=` 加上 `HMAC-SHA256(secret, timestamp + "." + rawBody)`。

只有 2xx 响应视为成功。失败依次在 5 秒、30 秒、2 分钟、10 分钟和 1 小时后重试，最多 8 次后进入死信。每次响应最多保留 2 KB 摘要，不保存请求签名密钥。端点禁止凭据嵌入、自定义端口、localhost、私网和云元数据地址；Worker 会在 DNS 解析后再次校验并锁定连接地址。

## 数据库自动化

数据库工具栏的“自动化”入口提供本地规则编辑器。规则以属性变更为触发器，可组合等于、不等于、包含、为空、非空和数值大小条件，再写入一个或多个非派生属性。公式与 Rollup 属性始终只读，单条规则最多 20 个动作，单次规划最多处理 50 条规则。

主编辑和自动化规划在同一事务中执行，每条规则使用独立 Savepoint：动作失败不会丢失用户刚完成的编辑。执行磁带保存触发输入、规则快照、计划输出、状态和错误；修正规则后可从失败记录重放原始输入，重放成功或失败都会生成新的关联记录。
