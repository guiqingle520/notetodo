# NoteTodo 编码与工程规范

> 版本：1.0  
> 适用范围：`apps/*`、`packages/*`、`scripts/*`、数据库迁移、测试与工程文档  
> 基线日期：2026-08-09  
> 规范来源：阿里巴巴 P3C、Google TypeScript Style Guide、Airbnb JavaScript Style Guide，以及 React、Electron、Fastify、Playwright 官方规范。本文是适配 NoteTodo 的统一规则，不是对任一规范的逐字复制。

## 1. 规范目标与规则等级

本规范服务于 NoteTodo 的核心约束：本地优先、离线可写、数据不丢失、权限先于检索、桌面端安全、AI 与工具可插拔。代码“能运行”只是最低要求；可验证、可恢复、可审计、可维护同样属于交付内容。

规则分为三级：

- **必须（MUST）**：违反即不得合并；由编译器、Lint、测试或代码审查阻断。
- **应该（SHOULD）**：默认遵循；偏离时必须在 PR 中说明理由。
- **可以（MAY）**：团队认可的可选实践。

发生冲突时，优先级从高到低为：

1. 数据安全、权限与用户隐私；
2. 已批准的 RFC 和公开契约；
3. 本规范；
4. 自动格式化工具的结果；
5. 个人偏好。

紧急修复可以临时偏离非安全规则，但必须关联补偿任务。任何规则豁免都应尽量限定到单行或单文件，注明原因和移除条件，不允许全局关闭检查来绕过局部问题。

## 2. 当前技术基线与迁移约束

当前仓库与开发计划存在阶段性差异，执行时以以下规则为准：

| 项目 | 当前仓库 | 目标规划 | 规范要求 |
|---|---|---|---|
| 单仓工具 | npm workspaces + `package-lock.json` | pnpm + Turborepo | 迁移 RFC 批准前只用 npm，不得混入第二份锁文件 |
| 语言 | TypeScript、少量 CJS/MJS | TypeScript 单仓 | 新业务代码优先 TypeScript；CJS 仅限 Electron/兼容边界 |
| 桌面端 | Electron + React + Vite | 保持 | 主进程、预加载、渲染进程严格隔离 |
| 编辑器/协作 | Tiptap/ProseMirror + Yjs | 保持 | Schema 和同步协议变更必须先写 RFC |
| 状态管理 | Zustand | 保持或按 RFC 调整 | Store 按领域拆分，组件使用细粒度 selector |
| API | 当前为轻量服务代码 | Fastify + TypeScript | 引入 Fastify 后启用第 9 节全部规则 |
| 数据 | SQLite；规划 PostgreSQL | SQLite + PostgreSQL | SQL、仓储和领域服务三层分离 |
| 测试 | Vitest | Vitest + Playwright | 新增关键旅程时同步补 E2E |

**必须**保持唯一包管理器和唯一锁文件。若切换到 pnpm/Turborepo，应以独立 PR 完成，并同时更新 CI、开发文档、缓存策略和发布流程，禁止业务 PR 顺手迁移。

## 3. 自动格式化与文件约定

### 3.1 基础格式

- 源文件使用 UTF-8、LF 换行和文件末尾单个换行。
- 缩进 2 个空格，禁止 Tab 缩进。
- 字符串默认单引号；JSX 属性默认双引号。
- 沿用仓库现状，不写分号；必须使用自动格式化与 Lint 防止 ASI 歧义。
- 建议打印宽度 100；URL、不可拆字符串和生成代码可例外。
- 多行对象、数组、参数与导入保留尾逗号。
- 一行只表达一个主要动作；禁止用嵌套三元表达式承载业务流程。
- 禁止提交行尾空格、不可见特殊空格或混合换行符。
- 自动生成文件必须在文件头标明来源和重新生成方法，禁止手工编辑。

建议由 Prettier 负责纯格式，由 ESLint 负责语义。不要让二者重复管理同一条格式规则。

推荐格式基线：

```json
{
  "semi": false,
  "singleQuote": true,
  "jsxSingleQuote": false,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 100
}
```

### 3.2 文件大小和职责

- 现有硬门禁：任何代码文件不得超过 1000 行。
- 新文件应控制在 500 行以内；超过 500 行需要在 PR 中解释为什么继续拆分会损害内聚性。
- 普通函数应优先控制在 60 行以内；超出后先检查是否混合了校验、业务决策、持久化和展示转换。
- React 组件文件只承载一个主要组件；小型私有子组件可同文件存在。
- 一个模块只负责一个领域概念，不以 `utils.ts`、`helpers.ts` 长期收纳无边界逻辑。

## 4. 命名规范

### 4.1 通用命名

| 对象 | 规则 | 示例 |
|---|---|---|
| 变量、函数、参数 | `camelCase`，表达业务含义 | `workspaceId`、`loadPageTree` |
| 类型、接口、类、React 组件 | `PascalCase` | `SyncCheckpoint`、`DatabaseView` |
| 常量 | 普通常量用 `camelCase`；真正跨模块且不可变的常量用 `UPPER_SNAKE_CASE` | `saveDelayMs`、`MAX_BATCH_SIZE` |
| 布尔值 | 使用 `is`、`has`、`can`、`should` 前缀 | `isOffline`、`canEditPage` |
| 事件处理函数 | 内部函数用 `handleXxx`，组件回调用 `onXxx` | `handleSave`、`onSelectionChange` |
| Hook | 必须以 `use` 开头 | `useWorkspaceSearch` |
| 数据库表和字段 | `snake_case` | `workspace_id`、`created_at` |
| 环境变量 | `UPPER_SNAKE_CASE`，按域加前缀 | `NOTETODO_DATABASE_URL` |
| 包名 | 小写 `kebab-case`，使用 `@notetodo/` scope | `@notetodo/sync-core` |

命名还必须满足：

- 禁止无意义缩写，如 `tmp`、`mgr`、`proc`、`data1`；通用缩写 `id`、`url`、`api`、`db` 可使用。
- 禁止给接口添加 `I` 前缀，也不使用 `Impl` 作为默认后缀。名称应说明角色，如 `PageRepository`、`SqlitePageRepository`。
- 名称不重复类型信息，例如 `pageArray` 应写为 `pages`，`userString` 应写为 `userName`。
- 时间和单位必须进入名称：`timeoutMs`、`sizeBytes`、`createdAt`，禁止含糊的 `timeout`、`size`。
- 集合使用复数名；映射说明键和值，如 `pageById`、`membersByWorkspaceId`。
- 避免否定布尔命名，如用 `isEnabled`，不用 `isNotDisabled`。

### 4.2 文件命名

- React 主组件文件使用 `PascalCase.tsx`，与导出的主组件同名。
- 普通模块、领域服务、仓储和 Hook 使用 `kebab-case.ts`。
- 测试与被测文件同目录，命名为 `*.test.ts` 或 `*.test.tsx`。
- E2E 测试命名为 `*.spec.ts`，放在独立的 `e2e/` 或 `tests/e2e/`。
- SQL 查询清单使用 `kebab-case.sql` 或领域级 `kebab-case.cjs/ts`；迁移文件使用不可变的递增版本加描述。
- `index.ts` 只用于包的公共出口或极小目录，不得掩盖复杂业务实现。

## 5. TypeScript 规范

### 5.1 编译器基线

所有包必须开启 `strict`，并逐步收敛到以下公共基线：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true
  }
}
```

若旧代码暂时无法开启某项检查，应按包记录迁移任务，不允许新包降低基线。

### 5.2 类型安全

- 禁止在业务代码中使用 `any`。外部未知输入使用 `unknown`，校验和缩窄后再进入领域层。
- 禁止使用 `String`、`Number`、`Boolean`、`Object` 包装类型，使用小写原始类型。
- 禁止无理由的非空断言 `!`、双重断言和 `as unknown as T`。
- 禁止使用 `@ts-ignore` 和 `@ts-nocheck`。确需测试编译错误时可使用 `@ts-expect-error`，并写明预期错误原因。
- 对象契约优先 `interface`；联合、交叉、元组、映射和工具类型使用 `type`。
- 对有限状态优先使用判别联合，不使用多个互相矛盾的布尔字段。
- 公共 API、跨包契约、IPC、网络响应和持久化对象必须显式声明类型。
- 局部变量和简单私有返回值允许可靠推断，禁止为了“看起来类型多”重复标注显然类型。
- 只读输入使用 `readonly`、`Readonly<T>` 或 `readonly T[]`；不得修改参数、Props、Store 快照或 Hook 输入。
- ID 类型较多时应使用品牌类型或领域封装，防止 `pageId` 与 `workspaceId` 被误传。
- 货币、容量、持续时间不得只用裸 `number` 而不说明单位。
- JSON、IPC、数据库、环境变量和模型输出都是运行时边界，TypeScript 类型不能代替运行时校验。

推荐的状态建模：

```ts
type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: AppError }
```

不推荐：

```ts
interface LoadState<T> {
  isLoading: boolean
  data?: T
  error?: Error
}
```

### 5.3 模块与导出

- 默认使用 ESM `import`/`export`。CJS 只保留在 Electron 启动或第三方兼容边界。
- 新代码优先命名导出；框架要求或单一入口可使用默认导出。
- 只导出包外真正需要的符号，禁止为测试暴露私有实现。
- 类型导入使用 `import type`。
- `apps/*` 可以依赖 `packages/*`；`packages/*` 禁止反向依赖 `apps/*`。
- 包之间通过公开入口和契约交互，禁止深层导入另一个包的 `src/internal/*`。
- `editor-core`、`sync-core`、`permissions` 等领域包不得依赖 React、Electron 或具体数据库驱动。
- 禁止循环依赖；发现后应拆出契约或重定职责，不用延迟加载掩盖结构问题。

### 5.4 函数与控制流

- 默认使用 `const`；只有确需重新赋值时使用 `let`；禁止 `var`。
- 函数参数超过 4 个时改用具名参数对象。
- 优先提前返回，减少超过 3 层的嵌套。
- `switch` 处理判别联合时必须穷尽，新增状态必须触发编译或 Lint 错误。
- 禁止裸魔法数字和魔法字符串；提取为带单位和业务语义的常量。
- 禁止修改函数入参；转换结果返回新值。
- 不为“可能将来复用”提前抽象。出现稳定的重复业务语义后再抽象。
- 注释解释原因、约束、风险和不变量，不复述代码。

## 6. 异步、错误与日志

### 6.1 异步代码

- 所有 Promise 必须被 `await`、`return`、聚合处理或明确用 `void` 标记为刻意忽略。
- 独立任务可用 `Promise.all` 并行；需要容忍局部失败时使用 `Promise.allSettled` 并逐项处理结果。
- 网络、模型、插件、MCP、对象存储和子进程调用必须有超时、取消或明确的生命周期上限。
- 用户切换页面、关闭窗口或取消任务时，应通过 `AbortSignal` 向下游传播取消。
- 禁止用固定延时等待异步状态；测试和产品代码都应等待可观察条件。
- 重试只用于暂时性错误，必须限制次数并使用退避；写操作重试前必须具备幂等键。
- 捕获异常的范围应尽量小，使读者能明确哪一步可能失败。

### 6.2 错误模型

- 只抛出 `Error` 或其子类，禁止抛字符串、数字或普通对象。
- 领域错误应有稳定的 `code`、安全的用户消息、原始 `cause` 和必要上下文。
- 禁止空 `catch`。若错误确实可忽略，必须解释原因并留下可观测信号。
- UI 不直接展示底层堆栈、SQL、路径、令牌或供应商原始错误。
- 错误不得被重复记录。由最了解业务上下文、且确定不会继续向上传播的一层记录一次。
- 权限拒绝、输入错误、冲突和系统故障必须使用不同错误码，不能全部返回 500。

```ts
class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, { cause: options?.cause })
  }
}
```

### 6.3 日志与隐私

- 使用结构化日志，不拼接难以检索的长字符串。
- 日志至少能关联 `requestId`、`workspaceId`、`actorId` 或 `runId` 中适用的字段。
- 禁止记录 API Key、Cookie、Authorization Header、密码、OS Keychain 内容、完整 Prompt、完整页面正文和附件原文。
- 用户标识、文件路径、页面标题等敏感字段按可观测需求最小化，并在上报前脱敏。
- 禁止用 `console.log` 作为生产日志方案；允许在本地临时调试，但提交前清理。
- 审计日志与调试日志分离。权限、外发、删除、密钥和 Agent 工具调用写入不可抵赖的审计事件。

## 7. React、状态与 UI 规范

### 7.1 React

- 只使用函数组件和 Hook；不得新增类组件。
- 组件和 Hook 必须纯净：渲染期间不得写 Store、调用数据库、生成随机 ID 或修改外部对象。
- Hook 只在组件或自定义 Hook 顶层调用，不在条件、循环、回调或异步函数中调用。
- Props、State、Context 和 Hook 参数视为不可变快照。
- `useEffect` 只用于与 React 外部系统同步，不用于可由 Props/State 直接推导的值。
- Effect 必须处理清理、竞态和过期响应；订阅、定时器和监听器必须成对注销。
- 不滥用 `useMemo`、`useCallback`。只有测量证明、稳定引用契约或明显高成本计算时才使用。
- 列表 `key` 使用稳定业务 ID；禁止在可重排列表中使用数组索引或渲染时生成 ID。
- 组件不得直接访问 Electron/SQLite；通过类型化服务或 Repository 接口调用。
- Error Boundary 应围绕编辑器、数据库视图、插件面板等高风险区域设置，并提供恢复路径。

### 7.2 Zustand 与状态边界

- Store 按领域拆分，不建立一个全局万能 Store。
- 组件只订阅需要的最小切片；返回对象的 selector 应使用稳定比较策略。
- 远程/数据库事实、编辑器临时状态和纯 UI 状态分开管理。
- 可推导状态不重复存储；必要缓存必须有失效规则。
- Store Action 表达领域动作，如 `archivePage`，不暴露任意 `setState` 给业务组件。
- 持久化 Store 必须有版本号和迁移函数。

### 7.3 UI 与可访问性

- 使用语义 HTML；可点击交互优先 `button`、导航优先 `a`，不使用带点击事件的 `div` 模拟。
- 所有关键路径可用键盘完成，焦点清晰且弹窗关闭后恢复到合理位置。
- 图标按钮必须有可访问名称；表单输入必须有关联标签和错误说明。
- 颜色不能是唯一状态信号；文本和图标需提供等价信息。
- 动效遵守 `prefers-reduced-motion`。
- 空、加载、错误、离线、只读、权限不足和同步冲突都是正式 UI 状态。
- 颜色、间距、阴影、圆角、层级和动效使用 Design Token；禁止散落临时值和随意增加 `z-index`。
- 大文档和大表格必须窗口化，禁止一次挂载全部节点。
- 用户可见文案不得直接写在深层领域逻辑中，为后续国际化保留出口。

## 8. Electron 安全与 IPC 规范

以下均为**必须**规则：

- Renderer 禁用 Node Integration，启用 `contextIsolation` 和进程沙箱。
- Preload 只通过 `contextBridge` 暴露最小、具体、不可扩权的 API；禁止暴露整个 `ipcRenderer`。
- IPC Channel 使用 `domain:action`，如 `page:load`、`attachment:open`，并在共享契约中集中声明。
- 每个 IPC 请求和响应都执行运行时 Schema 校验；不能因为调用方是本地 Renderer 就信任输入。
- 主进程验证所有 IPC 消息的 `sender`/`senderFrame`，拒绝非受信来源。
- 特权操作在主进程再次执行权限检查，Renderer 的“按钮已禁用”不构成授权。
- 禁止加载并执行远程代码；远程页面不得获得 Node 或 Preload 特权。
- 使用限制性 CSP；不得关闭 `webSecurity`，不得启用 `allowRunningInsecureContent`。
- 导航、新窗口、协议处理和权限请求使用 Allowlist。
- `shell.openExternal` 只接收解析和校验后的 `https:` URL，并限制允许的主机或明确提示用户。
- 本地资源优先使用受控自定义协议，不向不可信内容暴露任意 `file://` 路径。
- 文件读写必须规范化和校验路径，防止目录穿越、符号链接绕过和覆盖非授权文件。
- 密钥放 OS Keychain；不得进入 Renderer、普通 SQLite 表、日志、错误报告或 AI Prompt。
- Electron、Chromium、Node 和关键依赖保持受支持版本；安全更新不得长期积压。

IPC Handler 只做四件事：校验调用方、校验输入、调用领域服务、序列化安全响应。SQL、权限决策和复杂业务逻辑不直接写进 Handler。

## 9. API 与 Fastify 规范

本节在 Fastify 正式引入后作为强制规则；引入前，现有 API 也应遵守相同边界。

- 按领域注册 Fastify Plugin，利用封装边界隔离 Hook、Decorator 和路由。
- 每条公开路由必须声明 Params、Query、Body 和各状态码 Response Schema 中适用的部分。
- 输入校验在 Handler 前完成；异步数据库/权限检查放在合适的 Hook 或领域服务，不放进初始 Schema Validator。
- Response Schema 必须排除敏感字段，不能把数据库对象直接透传给客户端。
- Schema 是应用代码，只能来自受信源码；不得编译用户提供的任意 Schema。
- Route Handler 保持薄层：解析契约、调用用例、映射响应；业务规则放在领域服务。
- 认证与授权分离：认证回答“你是谁”，授权回答“你能对该资源做什么”。每次资源访问均执行授权。
- 列表接口使用稳定分页游标，设置默认和最大页大小；禁止无限制返回。
- 写接口使用幂等键或业务唯一约束；Webhook、同步和自动化必须能安全重放。
- API 错误包含稳定 `code`、面向用户的 `message`、可关联的 `requestId`，不泄露内部堆栈。
- API 版本变更遵循兼容策略；破坏性变更先给迁移期和弃用说明。
- Provider、Webhook、插件与 MCP 契约必须有消费者/提供者契约测试。

## 10. 数据库、事务与迁移规范

### 10.1 分层

- SQL 只存在于 `sql/` 查询清单和迁移文件中。
- `repositories/` 负责预编译查询、行映射和数据库细节。
- 领域服务负责业务规则、权限、事务边界和跨仓储协调。
- UI、IPC Handler、HTTP Route 和 Worker 禁止直接拼接或执行 SQL。
- 保留并持续收紧现有 `check:sql` 门禁，旧模块的内嵌 SQL 预算只能下降，不能上升。

### 10.2 SQL 与模型

- 所有外部值使用参数化查询，禁止字符串拼接 SQL。
- 禁止 `SELECT *`；显式列出字段，避免 Schema 演进导致契约漂移。
- 表、列、索引和约束使用 `snake_case`，名称表达领域含义。
- 每张核心表必须有主键、必要的租户/工作区边界、创建时间和修改时间。
- 数据库唯一性和外键等不变量由数据库约束兜底，不能只依赖 UI 校验。
- 查询必须带工作区/租户边界；权限过滤不得在取回全部数据后才进行。
- 新索引必须对应真实查询和执行计划；禁止“可能有用”就添加索引。
- 批量操作必须分批并设置上限，避免长事务和内存峰值。
- SQLite 时间统一存 UTC Unix 毫秒整数；PostgreSQL 使用 `timestamptz`。API 输出统一为带时区的 ISO 8601。
- 金额使用最小货币单位整数或定点数，禁止浮点金额。
- 可空字段必须具有明确业务语义，不能用 `null`、空字符串和缺失字段表示同一状态。

### 10.3 事务与迁移

- 事务围绕业务不变量定义，不围绕单条 SQL 机械创建。
- 事务内禁止网络、模型、对象存储等不可控长耗时调用；采用 Outbox 或补偿流程衔接。
- 事务必须短小，并以固定顺序访问资源以降低死锁风险。
- 已进入发布版本的迁移文件不可修改，只能追加新迁移。
- 迁移必须可重复启动、可检测当前版本，并对中断给出恢复方案。
- 破坏性 Schema 变更采用“扩展—迁移—切换—收缩”，不在单个版本直接删除仍被旧客户端使用的字段。
- 桌面数据库升级前必须验证备份/恢复路径；失败时不得启动在半迁移状态继续写入。
- 数据修复脚本必须支持 Dry Run、数量对账、范围限制和审计输出。

## 11. CRDT、同步与编辑器规范

- Page、Block、Record、Update 使用稳定且全局唯一的 ID，禁止用数组位置或本地自增值充当跨端身份。
- ProseMirror/Tiptap Schema、Yjs Update 格式、页面树排序和同步协议属于版本化契约；非兼容修改先写 RFC。
- 文档修改通过编辑器 Transaction 或 Yjs Transaction 完成，不绕过框架直接修改内部状态。
- 同一业务操作的文档更新、元数据更新和 Outbox 记录需要明确的原子性或恢复顺序。
- 服务端和客户端写入都必须幂等；重放同一 Update 不得产生重复副作用。
- 不用墙上时钟单独决定并发顺序；使用逻辑时钟、Actor ID 和已批准的确定性冲突规则。
- 删除使用 Tombstone 或可恢复状态，直到同步确认和保留期允许物理回收。
- 快照压缩前验证可从快照加后续 Update 完整恢复。
- Presence、光标等临时状态不得混入持久化文档真相。
- 所有同步状态机都有属性测试或模型测试，至少覆盖乱序、重复、丢包、断线重连、时钟偏差和崩溃恢复。
- 编辑器命令必须可组合、可撤销或明确声明不可撤销；不可撤销操作必须在 UI 中二次确认。

## 12. AI、模型网关、插件与 MCP 规范

- 模型输出、工具返回、网页内容和外部连接器数据均视为不可信输入，必须验证后使用。
- Provider 通过统一能力接口接入，业务代码不得散落供应商特有判断。
- Provider 适配器必须处理超时、取消、限流、流式中断、重试边界、费用和错误映射。
- Prompt 不包含用户未授权的页面、附件、密钥、内部路径或跨工作区数据。
- 检索在查询时执行 ACL 过滤；禁止先跨权限召回后仅靠 Prompt 要求模型忽略。
- 每个工具声明输入 Schema、输出 Schema、权限、是否有副作用、超时和预算。
- 外发、批量写、删除、权限变更和不可逆操作必须生成可审阅 Patch，并由用户明确确认。
- Tool Call 使用最小权限、幂等键、步数/时间/费用上限和完整审计记录。
- 插件进程与 Renderer、主进程隔离，默认无文件系统、环境变量、网络和凭据访问权。
- 不执行模型生成的 JavaScript、SQL、Shell 或模板代码；若产品功能确需执行，必须进入专门沙箱并经过明确审批。
- 记录 AI 可观测数据时默认保存元数据和哈希，不默认保存完整用户内容；保留策略必须可配置。
- RAG 回答保留 page/block/version 级引用，索引过期时向用户说明。

## 13. 测试规范

### 13.1 测试层级

| 层级 | 主要对象 | 必测内容 |
|---|---|---|
| 单元测试 | 纯函数、领域规则、转换器 | 正常、边界、失败和不变量 |
| 属性/模糊测试 | 导入、Schema、公式、同步状态机 | 随机输入、Round-trip、乱序与重复 |
| 契约测试 | API、IPC、Provider、Webhook、插件、MCP | Schema、兼容性、错误映射 |
| 集成测试 | SQLite/PostgreSQL、对象存储、队列 | 真实事务、约束、迁移和恢复 |
| E2E | Windows/macOS/Linux 核心旅程 | 用户可见行为、离线、权限、崩溃恢复 |
| Golden Test | Notion 导入、富文本、附件、数据库映射 | 结构和计数不静默丢失 |

### 13.2 编写规则

- 修复缺陷时先增加能复现问题的测试，再提交修复。
- 测试名称描述“条件—行为—结果”，不写 `works`、`test1`。
- 每个测试独立运行，不依赖执行顺序、共享脏数据或上一个测试的副作用。
- 时间、随机数、网络和 ID 生成通过可控依赖注入；不得用真实等待制造稳定性。
- Mock 只替换进程边界和不可控依赖，不要 Mock 被测模块内部每一层。
- 每次测试后恢复 Timer、Spy、环境变量和全局状态；建议 Vitest 开启 `restoreMocks`。
- Snapshot 只用于稳定且适合审阅的结构。更新 Snapshot 前必须人工审阅差异。
- Playwright 优先按 Role、Label、可见文本和稳定 Test ID 定位；禁止依赖脆弱 CSS 层级或 XPath。
- E2E 使用 Web-first Assertion，禁止先查询布尔值再立即断言。
- Flaky Test 视为缺陷；不得长期靠重跑掩盖。隔离后必须有负责人和修复期限。
- 覆盖率是风险提示而非目标本身。权限、迁移、同步、加密和恢复路径不得仅因总覆盖率达标而免测。

## 14. 注释、文档与 RFC

- 注释解释“为什么”“有什么不变量”“移除条件是什么”，不复述代码。
- 权限、安全隔离、事务边界、CRDT 冲突、迁移、兼容 Workaround 和非显然性能优化必须注释。
- 公共核心接口使用 TSDoc，说明契约、错误、权限要求、副作用和单位。
- TODO 必须包含关联任务或明确完成条件；禁止永久存在的模糊 TODO/FIXME。
- 代码变更导致 README、API、Schema、配置、运维方式或用户行为变化时，文档必须在同一 PR 更新。
- 以下变更先写 RFC：编辑器 Schema、同步协议、权限继承、公式语言、插件沙箱、加密边界、Notion 导入映射和重大依赖迁移。
- RFC 至少包含背景、目标/非目标、方案、备选方案、数据迁移、兼容性、安全、可观测性、回滚与验收方法。

## 15. Git、提交与代码审查

### 15.1 分支和提交

- 提交使用 Conventional Commits：`type(scope): description`。
- 推荐类型：`feat`、`fix`、`refactor`、`perf`、`test`、`docs`、`build`、`ci`、`chore`、`revert`。
- Scope 使用稳定领域名，如 `editor`、`desktop`、`sync`、`permissions`、`api`、`db`、`ai`、`mcp`。
- 主题行使用祈使语气，说明结果，不写“update files”“fix bug”。
- 一个提交只表达一个逻辑变化；格式化、重命名和行为修改尽量分开。
- 不提交密钥、真实用户数据、生产数据库、构建产物、临时日志和个人 IDE 配置。

示例：

```text
feat(sync): persist idempotency keys for replayed updates
fix(permissions): filter revoked pages before vector retrieval
refactor(db): move page queries into workspace repository
```

### 15.2 PR 规则

- PR 描述包含：问题、方案、影响范围、验证证据、风险、迁移/回滚方式和界面截图（若适用）。
- PR 应保持可审查。超过约 500 行有效逻辑变更时，优先拆分；生成文件和机械迁移可单独说明。
- 合并至少需要 1 名非作者批准。
- 权限、认证、密钥、数据库迁移、同步协议、加密、自动更新、插件沙箱和危险 AI 工具变更至少需要 2 名审查者，其中 1 名为对应领域负责人。
- 作者必须先自审 Diff，清理调试代码、无关修改、误提交数据和过期注释。
- 审查重点依次为：正确性与数据安全、权限、安全、兼容性、恢复能力、测试、可维护性，最后才是格式偏好。
- 所有阻断评论解决后再合并；重大异议通过 RFC 或明确决策记录解决，不在评论区无限拉扯。

## 16. CI 质量门禁

主分支保护至少按以下顺序执行：

1. 锁文件和依赖一致性检查；
2. 格式检查；
3. ESLint 语义检查；
4. 全仓 TypeScript 类型检查；
5. 现有文件行数与 SQL 边界检查；
6. 单元、属性、契约和集成测试；
7. 生产构建与 Electron 打包冒烟；
8. Playwright 核心 E2E；
9. 数据库迁移与备份恢复验证；
10. 依赖漏洞、秘密、SAST 和许可证检查。

推荐 ESLint 基线：

- `@eslint/js` recommended；
- `typescript-eslint` 的 `recommendedTypeChecked`，新包逐步采用 `strictTypeChecked`；
- React 官方 Hooks 和 React 规则插件；
- 导入边界、无循环依赖和包分层规则；
- 安全规则：禁用 `eval`、动态代码执行、不安全 DOM 注入和未校验外部 URL；
- 重点错误级规则：`no-floating-promises`、`no-misused-promises`、`switch-exhaustiveness-check`、`only-throw-error`、`no-explicit-any`。

CI 中 Warning 也必须有预算。新代码不得增加 Warning；预算按迭代持续降到零，不能让 Warning 永久成为背景噪声。

## 17. 完成定义（Definition of Done）

功能同时满足以下条件才算完成：

1. 真实端到端用户旅程可运行；
2. 数据失败后可重试、恢复或清楚告知用户；
3. 权限检查覆盖 API、IPC、搜索、向量召回、AI 和工具调用；
4. 格式、Lint、类型检查、测试和生产构建全部通过；
5. 性能没有突破对应预算，并有可重复证据；
6. 桌面实机或 Chromium 视觉检查通过；
7. 空、加载、错误、离线、只读和权限不足状态已处理；
8. 日志和遥测不包含密钥或不必要的用户内容；
9. 数据变更有迁移、备份、回滚或恢复方案；
10. 新的非显然架构决策已记录到注释、文档或 RFC。

## 18. NoteTodo 必守性能与可靠性预算

- 冷启动：P50 < 2.0 秒，P95 < 3.5 秒。
- 输入到显示：P95 < 50ms；自动保存不得阻塞输入。
- 连续输入默认合并写入 350ms；离开页面和退出应用时必须 Flush。
- 10 万 Block 工作区搜索：P95 < 300ms。
- 1 万行表格常用过滤、排序：P95 < 500ms。
- 同区协作更新端到端：P95 < 300ms。
- 应用业务入口目标：< 100KB gzip；大型编辑器、数据库视图和 AI 工具按依赖域或路由拆包。
- 随机杀进程、网络抖动、磁盘满和离线重连测试不得产生静默数据丢失。
- 性能优化必须附 Benchmark、Profile 或可重复测试，不接受凭感觉微优化。

## 19. 落地顺序

为避免一次性规则引发大量无关改动，按以下顺序实施：

### 第一阶段：立即执行

- 将本文作为团队统一规范；
- 保留 `check:lines` 和 `check:sql`；
- 增加统一格式检查，不批量改写无关文件；
- 启用 TypeScript ESLint 基础规则、Promise 安全规则和 React Hooks 规则；
- 将 `lint` 加入根目录 `check`；
- 在 PR 模板中加入安全、数据、测试与恢复检查项。

### 第二阶段：按包收紧

- 为所有 TypeScript 包统一 `tsconfig.base.json`；
- 开启 typed linting 和更严格的 TS 选项；
- 增加包依赖方向和循环依赖门禁；
- 将 CJS 业务逻辑逐步迁移到 TypeScript，Electron 启动边界除外；
- 清零 Lint Warning。

### 第三阶段：目标栈启用时执行

- pnpm/Turborepo 迁移使用独立 RFC 和独立 PR；
- Fastify 引入时一次建立 Plugin、Schema、错误和授权模板；
- Playwright 覆盖核心桌面旅程；
- 将迁移、备份恢复、Electron 安全配置和权限矩阵纳入发布门禁。

## 20. 参考规范

- 阿里巴巴 Java 开发手册 / P3C：<https://github.com/alibaba/p3c>
- Google TypeScript Style Guide：<https://google.github.io/styleguide/tsguide.html>
- Airbnb JavaScript Style Guide：<https://github.com/airbnb/javascript>
- React Rules：<https://react.dev/reference/rules>
- Electron Security Checklist：<https://www.electronjs.org/docs/latest/tutorial/security>
- typescript-eslint Typed Linting：<https://typescript-eslint.io/getting-started/typed-linting/>
- Fastify Validation and Serialization：<https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/>
- Fastify Encapsulation：<https://fastify.dev/docs/latest/Reference/Encapsulation/>
- Playwright Best Practices：<https://playwright.dev/docs/best-practices>
- Conventional Commits 1.0.0：<https://www.conventionalcommits.org/en/v1.0.0/>

## 附录 A：PR 自检清单

```text
[ ] 变更范围单一，命名表达业务语义
[ ] 外部输入已做运行时校验，没有新增 any / ts-ignore
[ ] Promise、超时、取消、重试和错误路径已处理
[ ] 权限在服务端/主进程边界重新校验
[ ] 没有记录密钥、完整正文或不必要的个人数据
[ ] SQL 参数化且位于 sql/ + repositories/ 边界
[ ] 数据写入具备事务、幂等、恢复或补偿方案
[ ] React 渲染保持纯净，Effect 有清理和竞态处理
[ ] Electron IPC 校验 sender、输入与响应
[ ] 新行为有对应层级的测试，缺陷有回归测试
[ ] 性能预算、离线、只读、错误和权限不足状态已验证
[ ] 文档、契约、迁移和 RFC 已按需更新
[ ] format、lint、typecheck、test、build 全部通过
```

## 附录 B：代码审查快速判定

出现以下任一情况应阻断合并：

- 从 Renderer 直接访问 Node、SQLite、文件系统或密钥；
- API、IPC、MCP、插件或模型输出未经运行时校验；
- 搜索或 AI 在 ACL 过滤前获取跨权限内容；
- 拼接 SQL、执行模型生成代码或将用户 Schema 交给动态编译器；
- 数据迁移无备份/恢复方案，或已发布迁移被直接修改；
- 写操作重试无幂等保证；
- 捕获后静默吞错，或日志包含密钥和完整用户内容；
- 同步协议、编辑器 Schema 或权限继承发生未版本化变更；
- 为通过检查而全局关闭 TypeScript、ESLint、安全或测试规则。
