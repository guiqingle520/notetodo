# NoteTodo：Notion 完整平替开发方案与计划

> 版本：0.1（立项基线）  
> 日期：2026-08-06  
> 产品定位：桌面优先、离线优先、可协作、可自托管、AI 模型与工具完全可插拔的知识与工作管理平台。

## 1. 目标定义

NoteTodo 不是“带 AI 的 Markdown 笔记”，而是一套统一承载文档、结构化数据库、项目任务、团队知识库、搜索、自动化和智能代理的工作空间。

“完全平替 Notion”定义为：

1. **核心体验平替**：页面树、块编辑、数据库多视图、模板、搜索、分享、评论、多人实时协作、离线使用。
2. **迁移平替**：Notion 内容可批量导入，常用数据类型、页面层级、附件、关系和视图最大限度保真；数据可完整导出，用户不被锁定。
3. **团队平替**：工作区、成员、群组、团队空间、细粒度权限、版本历史、通知、审计和管理员能力。
4. **AI 平替并超越**：工作区问答、写作、翻译、总结、数据库生成/填充、深度研究、会议纪要、智能代理；支持任意模型、自托管模型和 MCP 工具。
5. **生态平替**：开放 API、OAuth、Webhook、MCP Server、插件 SDK、自动化与外部数据连接器。
6. **可运维平替**：云服务与私有部署双形态，备份恢复、可观测性、安全、配额、计费和企业身份管理。

### 非目标

- 第一版不逐像素复制 Notion，也不复制其商标、文案和受保护素材。
- 不把 Notion API 当作主存储；它只用于迁移、兼容和可选的过渡期同步。
- 不承诺第一阶段覆盖 Notion Calendar、Mail 等相邻独立产品的全部能力；日历视图和邮件/日历连接器属于范围，完整邮件客户端另立项目。

## 2. 产品原则

- **Local-first**：所有已授权内容落地到本机，断网可读写，不要求用户逐页下载。
- **数据主权**：一键导出开放格式；本地数据库可备份；支持私有部署和组织自有对象存储。
- **AI 可替换**：模型、Embedding、重排器、语音识别和工具均通过适配层配置。
- **权限先于检索**：搜索、向量召回、AI 上下文和连接器结果都必须在查询时执行权限过滤。
- **块与数据库同源**：数据库每一行也是页面，文档和结构化数据不形成两套割裂系统。
- **兼容优先、扩展开放**：提供 Notion 风格交互和导入，同时保持内部模型不受其 API 限制。

## 3. 功能范围与优先级

### P0：可用产品闭环

- 工作区、页面树、收藏、最近访问、回收站。
- 块编辑器：段落、标题、列表、待办、引用、代码、分割线、折叠、图片、文件、书签、表格、公式、Callout、子页面。
- Slash Command、Markdown 快捷输入、拖拽排序、多选、复制粘贴、Undo/Redo、快捷键。
- 本地 SQLite 持久化、全文搜索、附件管理、自动保存、崩溃恢复。
- 数据库：表格视图，基础属性，筛选、排序、分组，行页面。
- 自定义模型：OpenAI-compatible、Anthropic、Google Gemini、Ollama、LM Studio；流式聊天、续写、改写、总结、翻译。
- Markdown、HTML、CSV 和 Notion 导出包导入；Markdown、HTML、CSV、JSON 完整导出。

### P1：Notion 核心平替

- 数据库视图：Table、Board、List、Gallery、Calendar、Timeline。
- 属性：文本、数字、单选、多选、状态、日期、人员、文件、复选框、URL、邮箱、电话、公式、关系、Rollup、创建/编辑元数据、ID。
- 数据库模板、关联视图、子项目、依赖、重复任务、图表、表单、按钮。
- 多端同步、多人光标、Presence、评论、@提及、通知、页面历史和恢复。
- 页面/团队空间/工作区权限，公开分享，访客，链接分享密码与过期时间。
- AI 工作区 RAG、引用溯源、数据库 Autofill、公式生成、页面/数据库 Agent 操作。
- MCP Client：接入文件、GitHub、浏览器、数据库等外部工具。
- MCP Server：允许外部 AI 客户端在授权范围内搜索、读取和写入 NoteTodo。
- 公共 REST/GraphQL API、OAuth 2.1、Webhook、自动化规则。

### P2：团队与生态平替

- Wiki、验证页面、内容所有者、模板市场、Synced Blocks、跨工作区复制。
- 仪表盘、数据库高级布局、条件格式、高级图表。
- 企业搜索连接器：Slack/Teams、Google Drive/OneDrive、GitHub、Jira/Linear、Gmail/Outlook、Calendar。
- AI 深度研究、联网搜索、可恢复的长任务、会议录音转写与总结。
- 插件 SDK：块、命令、侧栏面板、数据库视图、导入器、连接器、Agent Tool。
- SAML/OIDC SSO、SCIM、域名认领、审计日志、DLP、保留策略、Legal Hold、SIEM Webhook。
- Windows/macOS/Linux 自动更新、签名、公证、崩溃报告与企业安装包。

### P3：扩展产品线

- 移动端和 Web 端。
- Calendar 独立聚合应用与深度排期。
- Mail 独立客户端。
- Marketplace、付费插件、企业连接器市场。

## 4. 总体架构

采用 **TypeScript 单仓 + Electron 桌面壳 + 本地 SQLite + PostgreSQL 云端 + CRDT 协作层**。优先 Electron 是为了统一 Chromium 编辑行为、成熟的桌面能力和最快的产品迭代；若未来安装包体积成为首要指标，再评估 Tauri 壳，而不改共享业务层。

```text
Desktop (Electron)
├─ Renderer: React + TypeScript + Vite
│  ├─ Editor: ProseMirror/Tiptap + Yjs
│  ├─ Database Views
│  ├─ Search / AI / Settings
│  └─ Shared Design System
├─ Main Process
│  ├─ SQLite + FTS5
│  ├─ File/Object Cache
│  ├─ Sync Queue
│  ├─ Model Gateway (local/cloud)
│  └─ OS integration / updater / keychain
└─ Secure IPC with typed contracts

Cloud / Self-host
├─ API Gateway + Auth
├─ Workspace / Permission Service
├─ Sync & Realtime Collaboration Service
├─ Search Indexer + Vector Retrieval
├─ AI Orchestrator + Tool Sandbox
├─ Automation / Jobs / Connectors
├─ PostgreSQL + Redis/NATS
└─ S3-compatible Object Storage
```

### 推荐技术栈

| 层 | 选择 | 原因 |
|---|---|---|
| Monorepo | pnpm + Turborepo | 前后端共享类型、构建与发布清晰 |
| Desktop | Electron + electron-builder | 编辑器一致性好、系统集成成熟、交付快 |
| UI | React + TypeScript + Vite | 生态完整，适合复杂编辑器和多视图 |
| Design System | Radix Primitives + Tailwind/CSS Variables | 可访问性基础好，支持主题和高密度桌面 UI |
| Editor | Tiptap/ProseMirror + Yjs | Schema 可控，插件生态成熟，可接实时协作 |
| Local DB | SQLite + WAL + FTS5 | 可靠、便携、事务和本地全文检索成熟 |
| API | Fastify + TypeScript | 高性能、低框架负担，与共享类型契合 |
| Realtime | WebSocket + Yjs update log | 支持离线合并、多人协作和增量同步 |
| Cloud DB | PostgreSQL | 权限、关系数据、事务、运营查询成熟 |
| Cache/Queue | Redis 起步，规模化后 NATS/Kafka | 先降低运维复杂度，后续独立扩展 |
| Object Storage | S3-compatible | 云端与私有部署统一 |
| Search | PostgreSQL FTS 起步；OpenSearch/Tantivy 规模化 | 避免 MVP 过早引入重型基础设施 |
| Vector | pgvector 起步；Qdrant 可选 | 与权限元数据和运维体系容易统一 |
| Tests | Vitest + Playwright + Spectron 替代方案 | 单元、契约、桌面端到端覆盖 |
| Observability | OpenTelemetry + Sentry-compatible backend | 云端与自托管统一追踪标准 |

## 5. 核心数据与同步设计

### 5.1 领域对象

- `workspace`：租户和安全边界。
- `teamspace`：组织内容与继承权限。
- `page`：页面元信息、父级、图标、封面、归档状态。
- `block`：稳定 UUID、类型、属性、父级、有序位置；正文由协作文档承载。
- `database` / `data_source`：数据库定义与 schema。
- `record`：数据库行，同时关联一个 `page`。
- `property_value`：类型化属性值，不将全部值塞进不可查询 JSON。
- `view`：布局、可见属性、筛选、排序、分组和视图参数。
- `comment` / `mention` / `notification`：协作对象。
- `acl_entry` / `group` / `membership`：权限模型。
- `revision` / `sync_update`：历史、同步和恢复。
- `automation` / `integration` / `secret_ref`：开放平台对象。
- `ai_thread` / `ai_run` / `tool_call` / `citation`：可审计的 AI 执行记录。

### 5.2 冲突处理

- 富文本和块内容使用 Yjs CRDT。
- 页面树位置使用可排序的 fractional index，并为并发移动定义确定性规则。
- 数据库单值属性使用 `(logical_clock, actor_id)` 的 LWW Register；多值属性使用集合 CRDT。
- Schema 变更、权限变更、删除和恢复走服务器授权的强一致事务，不完全交给 CRDT。
- 每个客户端维护增量游标、Outbox、幂等键和校验点；服务端保留更新日志并周期压缩快照。
- 附件采用内容哈希、分片上传、断点续传和垃圾回收引用计数。

### 5.3 权限模型

- RBAC 管理组织角色，ACL 管理页面/团队空间资源权限。
- 权限支持继承、显式授权和显式禁止，决策顺序固定并有解释结果。
- 所有 API、搜索索引、向量检索、AI 工具调用均使用同一权限判定库。
- 本地缓存按用户加密；密钥放 OS Keychain，退出组织或远程擦除时撤销本地数据密钥。

## 6. AI 与自定义模型架构

### 6.1 模型网关

定义统一接口：

- `chat()`：文本/多模态、流式输出、结构化输出。
- `embed()`：可选择本地或远程 Embedding。
- `rerank()`：检索重排。
- `transcribe()`：会议录音转写。
- `image()`：可选图像生成。
- `capabilities()`：上下文长度、Tool Calling、视觉、JSON Schema、费用和数据策略。

首批 Provider：OpenAI-compatible、OpenAI、Anthropic、Gemini、Azure OpenAI、Ollama、LM Studio；用户可以配置 Base URL、模型名、自定义 Header、代理、证书、超时和价格。

API Key 不进入页面或普通数据库：桌面端存 OS Keychain，服务器端存 KMS/Vault，仅保存 `secret_ref`。支持个人 Key、工作区 Key、管理员白名单、模型路由、Fallback 和预算限制。

### 6.2 RAG 与 Agent

```text
用户请求
  → 意图/权限确认
  → 关键词 + 向量混合召回
  → ACL 过滤
  → 重排与上下文打包
  → 模型推理
  → 工具调用审批
  → 事务执行 / 回滚
  → 带页面与块级引用的答案
```

- 索引切分以页面块边界为主，保存 workspace/page/block/ACL/version 元数据。
- 生成结果必须可追溯到页面和块；索引版本落后时显示提示。
- 写操作先生成可审阅 Patch；批量修改、外发消息、删除、权限变更必须二次确认。
- Agent 使用最小权限 Token、步数/时间/费用预算、幂等 Tool Call 和完整审计日志。
- MCP Client 对工具做工作区级 Allowlist；MCP Server 暴露 `search/read/create/update/query_database` 等受控工具。
- 插件/工具进程与 Electron Renderer 隔离，使用受限子进程或容器沙箱，禁止默认访问全部文件系统和环境变量。

## 7. Notion 迁移与兼容策略

### 导入路径

1. **官方导出包优先**：解析 Markdown/HTML/CSV、目录层级、附件和页面 ID 映射。
2. **API 增量补全**：通过 Notion OAuth/PAT 获取页面、Block、数据库 Schema、评论、文件和视图等可用信息。
3. **过渡期增量同步**：Webhook 只作为“发生变化”的信号，再拉取最新资源；维护外部 ID、游标和幂等记录。
4. **迁移报告**：逐项报告成功、降级、丢失和需人工修复的内容，不能静默丢数据。

### 兼容限制

- Notion 导出的 CSV 不能重建关系属性，需结合 API 或迁移映射表恢复。
- 部分内部 UI 状态、某些高级块、权限细节和历史版本可能无法从公开接口完整取得。
- 因此“100% 数据迁移”需定义为：公开可导出/API 可访问的数据 100% 不静默丢失；不可访问项明确列出并提供替代方案。
- 不做长期双主写。推荐 2～4 周只读校验期后切换 NoteTodo 为唯一主系统，避免跨系统冲突不可控。

## 8. 工程目录规划

```text
notetodo/
├─ apps/
│  ├─ desktop/          # Electron main/preload/renderer
│  ├─ api/              # HTTP API and auth
│  ├─ collaboration/    # WebSocket/Yjs sync
│  └─ worker/           # indexing, automation, connectors
├─ packages/
│  ├─ editor-core/
│  ├─ database-core/
│  ├─ sync-core/
│  ├─ permissions/
│  ├─ model-gateway/
│  ├─ mcp/
│  ├─ import-export/
│  ├─ plugin-sdk/
│  ├─ ui/
│  ├─ contracts/
│  └─ testing/
├─ infra/
│  ├─ docker/
│  ├─ migrations/
│  └─ observability/
├─ docs/
└─ rfcs/
```

关键决策必须先写 RFC：编辑器 Schema、同步协议、数据库公式语言、权限继承、插件沙箱、端到端加密边界、Notion 导入映射。

## 9. 开发计划

以下工期以 **8～10 人全职团队** 为基线：产品/设计 2、桌面前端 3、后端/同步 3、AI/搜索 1～2、QA/SRE 1（部分角色可兼任）。小团队应按范围缩减，而不是按同样日期硬压。

| 阶段 | 周期 | 主要交付 | 出口标准 |
|---|---:|---|---|
| Phase 0：定义与原型 | 2～3 周 | PRD、信息架构、设计系统、编辑器/同步/导入 Spike、威胁模型 | 关键技术风险有可运行原型；P0 范围冻结 |
| Phase 1：本地编辑器 Alpha | 6～8 周 | Electron、页面树、核心 Block、SQLite、FTS、附件、导入导出、崩溃恢复 | 10 万 Block 工作区可用；断网完整编辑；无静默丢数据 |
| Phase 2：数据库 Alpha | 8～10 周 | 属性系统、Table/Board/List/Gallery、过滤排序分组、公式 v1、关系/Rollup | 1 万行数据库交互达性能线；关系和公式结果可复现 |
| Phase 3：云同步与协作 Beta | 10～12 周 | 账户/工作区、ACL、同步、多用户协作、评论、历史、分享、对象存储 | 离线多端冲突测试通过；20 人同页编辑稳定；权限无越权 |
| Phase 4：自定义 AI Beta | 6～8 周 | 模型网关、BYOK、本地模型、RAG、引用、AI 写作、数据库 Autofill、MCP 双向 | 5 类 Provider 契约测试通过；回答有引用；写操作可预览/撤销 |
| Phase 5：Notion 迁移与自动化 | 6～8 周 | 批量迁移器、迁移报告、API/Webhook、自动化、模板、Calendar/Timeline/Form/Chart | 真实大型工作区演练；公开可访问内容不静默丢失 |
| Phase 6：1.0 GA | 6～8 周 | 性能、安全、可访问性、自动更新、备份恢复、遥测、计费、支持流程 | SLO、安全评审、灾备演练、跨平台签名发布全部通过 |
| Phase 7：企业与生态 | 12～24 周 | SSO/SCIM、审计/DLP/SIEM、连接器、插件 SDK/市场、私有部署 | 设计合作客户验收，管理和合规控制可审计 |

### 建议发布节奏

- **第 2 个月**：本地单人 Alpha，验证编辑器和数据可靠性。
- **第 5 个月**：含数据库的封闭 Alpha，可承载个人真实数据。
- **第 8 个月**：协作 + AI Beta，邀请 20～50 个设计合作团队。
- **第 11～13 个月**：1.0 GA，达到 Notion 最常用能力的可迁移替代。
- **第 18～24 个月**：企业、生态和长尾功能补齐，才可对外宣称“全面平替”。

若只有 1～3 名开发者，合理预期是 6 个月做出单人本地版、12～18 个月做出可协作产品；完整团队/企业平替通常需要 24～36 个月或主动削减范围。

## 10. 首 12 周可执行迭代

### Sprint 0（第 1～2 周）

- 建立 Monorepo、CI、代码规范、发布通道和 RFC 模板。
- 完成编辑器 Block Schema、SQLite Schema、同步协议、权限模型四份 RFC。
- 做三个 Spike：10 万 Block 渲染、Yjs 离线冲突、Notion 导出包解析。
- 交付可点击高保真原型和测试工作区数据集。

### Sprint 1（第 3～4 周）

- Electron 安全基线：Context Isolation、严格 IPC、CSP、协议处理。
- 页面树、路由、工作区壳、主题、命令面板。
- SQLite migration、Repository 层、Outbox 和自动保存。
- 编辑器基础文本 Block、Slash Menu、快捷键。

### Sprint 2（第 5～6 周）

- 列表、待办、引用、代码、Callout、折叠和子页面。
- Block 拖拽、多选、复制粘贴、Undo/Redo。
- 图片/附件、内容哈希、本地缓存和垃圾回收。
- 单元测试、文档 Schema round-trip 和故障注入。

### Sprint 3（第 7～8 周）

- FTS5 索引、快速搜索、最近访问、收藏、回收站。
- Markdown/HTML/Notion ZIP 导入 v1，Markdown/JSON 导出。
- 大文档虚拟化、启动性能和内存基线。
- 首次内部 Dogfood，所有团队文档迁入副本。

### Sprint 4（第 9～10 周）

- Database Schema、记录/页面统一模型。
- Table View、列宽/冻结/排序/筛选、基础属性编辑器。
- 大表格虚拟化、批量粘贴和 CSV 导入导出。

### Sprint 5（第 11～12 周）

- Board/List View、分组和基础聚合。
- 公式语言 v0 语法与解释器，不直接执行 JavaScript。
- 关系/Rollup 数据模型 Spike。
- Alpha 质量门禁、备份恢复演练和 Phase 2 范围复盘。

## 11. 质量与验收指标

### 性能

- 冷启动 P50 < 2.0 秒，P95 < 3.5 秒（主流近五年设备）。
- 输入到显示 P95 < 50ms；自动保存不阻塞输入。
- 10 万 Block 工作区搜索 P95 < 300ms；1 万行表格常用操作 P95 < 500ms。
- 同区协作更新端到端 P95 < 300ms；断网重连不丢更新。

### 可靠性

- 数据写入路径全部有事务、幂等或可恢复日志。
- 随机杀进程 10,000 次、网络抖动和磁盘满故障测试不产生静默数据丢失。
- 每日自动备份；RPO ≤ 5 分钟，RTO ≤ 1 小时（云端目标）。
- 导入器逐项生成校验清单和内容计数对账。

### 安全

- Electron Renderer 无 Node 权限；所有 IPC 采用 Allowlist 和 Schema 校验。
- 密钥不进日志、数据库明文、错误报告或 AI Prompt。
- 每个检索与 AI 测试集都包含跨用户、跨页面和撤权后的越权测试。
- 上线前完成依赖扫描、SAST、秘密扫描、渗透测试和威胁模型复审。

### 测试层级

- 单元：公式、权限、Schema 转换、冲突规则。
- 属性/模糊：富文本 round-trip、导入解析、同步状态机。
- 契约：模型 Provider、API、插件、Webhook。
- 集成：SQLite/PostgreSQL、对象存储、队列、索引。
- E2E：Windows/macOS/Linux 的核心用户旅程。
- Golden Files：Notion 导入前后结构、富文本、附件和数据库映射。

## 12. 团队与工作流

### 推荐小队

- **Editor & Desktop**：编辑器、页面树、桌面集成、性能。
- **Database & Views**：属性、公式、关系、多视图。
- **Sync & Platform**：账户、权限、实时协作、API、存储。
- **AI & Search**：检索、模型网关、Agent、MCP、连接器。
- **Quality & Infra**：CI/CD、测试平台、发布、观测、安全。

每个两周 Sprint 必须交付可运行版本；每周 Dogfood；每月对 5 个真实 Notion 工作区做迁移回归。功能以“端到端用户旅程 + 数据恢复方案 + 遥测指标”完成，而不是 UI 出现即完成。

## 13. 主要风险与控制

| 风险 | 后果 | 控制措施 |
|---|---|---|
| “完整平替”范围无限扩张 | 永远无法发布 | 分 P0/P1/P2；对外承诺以验收矩阵而非口号为准 |
| 编辑器、CRDT、数据库三者耦合 | 数据损坏和难以演进 | 先定稳定 ID/Schema；协作日志与领域模型分层；属性测试 |
| Notion API/导出信息不完整 | 迁移失真 | 导出 + API 双路径；迁移报告；真实工作区 Golden Tests |
| AI 越权或误操作 | 数据泄露/破坏 | 查询时 ACL、Patch 预览、危险操作审批、审计与回滚 |
| 插件和 MCP 工具供应链风险 | 本机或组织凭据泄露 | 权限清单、签名、沙箱、秘密代理、管理员 Allowlist |
| Electron 安全和资源占用 | 企业拒绝部署 | 安全基线、进程隔离、性能预算；保持壳层可替换 |
| 过早微服务化 | 运维成本压垮团队 | 模块化单体起步，只将协作/Worker 按负载拆出 |
| 自托管版本碎片化 | 支持困难 | Helm/Docker Compose 单一发行物、数据库迁移门禁、LTS 策略 |

## 14. 立项前必须确认的产品决策

这些决策不阻塞技术原型，但必须在 Phase 0 结束前确定：

1. 首发用户：个人/小团队，还是中大型企业。
2. 部署优先级：官方云、纯本地，还是私有部署优先。
3. 首发平台：建议 Windows + macOS；Linux 在 Beta 后进入支持矩阵。
4. 商业模式：订阅、一次性买断、开源核心 + 商业云，还是企业授权。
5. 数据加密边界：服务器可解密以支持搜索/AI，还是端到端加密优先；两者会显著改变协作和 AI 架构。
6. “完整平替”验收基准：选定一批真实工作区与核心旅程，形成逐项可测的 Parity Matrix。

## 15. 推荐的下一步

1. 用 1 周把目标用户、部署形态、开源策略和 E2EE 取舍定下来。
2. 选择 5 个有代表性的 Notion 工作区作为迁移与性能基准样本。
3. 执行 Phase 0 三个技术 Spike，不先堆 UI：编辑器规模、离线冲突、迁移保真。
4. Spike 通过后冻结 P0，建立 12 周 Alpha 交付目标。
5. 同步建立 Parity Matrix，后续每个版本用自动化证据更新覆盖率。

## 16. 调研依据

- [Notion API Overview](https://developers.notion.com/guides/get-started/overview)：页面、数据库、视图、评论、搜索、OAuth/PAT 与 Webhook 能力。
- [Notion MCP](https://www.notion.com/help/notion-mcp)：第三方 AI 客户端实时读写 Notion 工作区的官方边界。
- [Notion AI FAQ](https://www.notion.com/help/notion-ai-faqs)：Agent、Enterprise Search、Research Mode、会议纪要、数据库 AI 等当前能力。
- [Notion AI Connectors](https://www.notion.com/help/notion-ai-connectors)：外部知识连接器范围与管理员要求。
- [Notion Offline](https://www.notion.com/help/use-pages-offline)：官方离线模式现状及限制。
- [Notion Databases](https://www.notion.com/help/category/databases) 与 [Database Views](https://www.notion.com/help/category/database-views)：数据库属性、关系、公式与视图能力。
- [Import Data](https://www.notion.com/help/import-data-into-notion) 与 [Webhooks](https://developers.notion.com/reference/webhooks)：迁移格式和增量同步约束。

截至本方案日期，官方资料支持“外部 AI 应用通过 MCP 使用 Notion 工作区”和“Notion AI 可使用其提供的不同模型”，但未显示用户可以为 Notion 内置 AI 任意配置自定义模型 Base URL。NoteTodo 因此将 BYOK、自定义 OpenAI-compatible Endpoint 和 MCP 双向能力作为原生差异化功能。
