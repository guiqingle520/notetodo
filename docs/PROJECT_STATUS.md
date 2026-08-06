# Project Status

> 更新时间：2026-08-06

## 当前里程碑

Content Parity, Import & Retrieval Alpha — **进行中**

### 已交付

- npm workspaces 单仓与统一 `check` 质量门禁。
- Electron 主进程、Sandbox、Context Isolation 和白名单 Preload API。
- React/Vite 桌面工作区壳。
- 暖纸/深墨/朱红视觉系统以及离线打包字体。
- 页面树、子页面、收藏、标题编辑和工作区导航。
- Tiptap 编辑器，包含基础富文本和任务列表。
- AI 工作副驾驶界面和模型状态入口。
- 版本化本地状态持久化。
- 领域单元测试、类型检查和生产构建。
- Chromium 视觉检查以及“编辑—刷新—恢复”回归。
- SQLite WAL 数据库、显式 Schema Migration 和事务化种子工作区。
- FTS5 本地全文搜索、最近访问排序和安全查询转义。
- 按页面合并的 350ms 防抖写入队列。
- 搜索命令面板、归档/恢复 UI 和中文 Slash Command。
- 依赖域分包：应用入口从约 602KB 降至约 21KB。
- Windows `win-unpacked` 开发包和隐藏桌面烟雾测试。
- SQLite Schema v2：数据库、属性、记录、类型化单元格值和视图分表存储。
- 窗口化 Table View、可编辑属性、筛选、排序和新建记录。
- Board/List 三视图与活动视图持久化。
- OpenAI-compatible、Ollama、LM Studio 模型配置界面。
- API Key 使用 Electron `safeStorage` 调用系统密钥加密，Renderer 不可读取明文。
- 模型连通性测试、8 秒超时和统一网关错误分类。
- SQLite Schema v3：Yjs 文档快照与有序增量更新日志。
- 编辑器页面会话的增量差分、120ms 批处理和退出/阈值快照压缩。
- 20 个离线 Yjs 客户端乱序合并后收敛测试。
- 独立 WebSocket 协作服务、鉴权优先协议、房间更新广播和 Presence 离线清理。
- OpenAI-compatible 聊天流式执行、UTF-8/SSE 边界解析和主动取消。
- AI 面板真实携带当前页面标题与正文上下文，Renderer 永不取得 API Key。
- 浏览器预览使用确定性本地流，视觉测试不会意外把工作区内容发给外部服务。
- 协作客户端状态机：认证握手、离线发送队列、500ms～15s 指数退避重连。
- Tiptap 原生 `Y.XmlFragment` 协作文档，以及 Schema v3 HTML/Y.Text 无损迁移。
- ProseMirror 远端光标、选区 Decoration 和协作者头像 Presence。
- 页面级角色权限、5 分钟 HS256 房间票据和服务端签名/页面/过期校验。
- 锚定选区的页面评论、@提及文本和解决状态。
- AI 结构化 `insert-paragraphs` Patch 预览、确认、协作撤销和 Schema v4 审计日志。
- SQLite Schema v5：AI 审计、页面权限和评论。
- 断线重连自动刷新页面票据，实际 WebSocket 离线编辑恢复后再次收敛。
- 空房间唯一播种者协议与确定性离线 HTML seed，双客户端首次同步不重复正文。
- SQLite Schema v6：结构化 mentions、按接收者隔离的通知与已读状态。
- 查看/评论角色的 Renderer 只读模式和协作服务端 `READ_ONLY` 强制执行。
- 成员权限撤销、真实未读收件箱和评论成员提及控件。
- AI 整页/选区上下文切换、来源引用、插入/替换双操作 Diff。
- 新增 `import-core`：Notion 混合导出档案预检、页面 ID/层级识别和资源上限。
- CSV 引号/换行/BOM 解析、保守字段类型推断，以及 Markdown 本地链接解析。
- ZIP 中央目录懒读取预检：不解压正文即可统计页面、数据库、附件与展开体积。
- Electron 原生 ZIP 文件选择、安全 IPC 与档案迁移预检界面。

### 当前验证结果

- TypeScript：通过。
- Vitest：14 个测试文件、44 个测试通过。
- Vite production build：通过。
- 浏览器控制台：当前版本无错误。
- 任务列表：2 个任务正确解析和渲染。
- 页面标题持久化：刷新后正确恢复。
- SQLite/FTS/归档恢复：通过。
- 连续 100 次同页更新只产生 1 次持久化写入：通过。
- Preload → IPC → SQLite 完整桌面链路：通过，退出码 0。
- 数据库迁移/单元格/记录/视图持久化：通过。
- Table/Board/List 真实 Chromium 视觉与交互：通过。
- 隔离桌面烟雾测试：Schema v3、5 条记录、3 个视图、系统加密密钥和同步快照全部通过。
- 协作协议：未认证拒绝、更新广播、离线 Presence 清理全部通过。
- AI SSE：中文 UTF-8 跨字节分片恢复与取消语义通过。
- 20 客户端协作编辑突发更新最终收敛：通过。
- 原生 Fragment 双客户端 round-trip 与恶意光标标签注入测试：通过。
- AI Patch 提议/应用审计、页面角色和锚定评论持久化：通过。
- 真实 Electron + WebSocket：Schema v5、短期票据、同步更新、评论与 Patch 审计通过。
- 双 Electron 独立用户目录首次同步：双方 6 个顶层块完全一致，无重复迁移。
- WebSocket 强制断线：票据刷新、离线编辑补发与双端重新收敛通过。
- 协作服务不可达：本机旧页面仍立即恢复 6 个原生块。
- Notion 导入预检：路径逃逸、重复路径、解压大小限制和畸形 CSV 防护通过。
- 真实 ZIP 中央目录懒读取、格式分类和体积统计：通过。
- 导入预检界面 Chromium 视觉与交互检查：通过。
- 全工作区：14 个测试文件、44 项测试通过。

## 当前里程碑余项

Content Parity, Import & Retrieval Alpha

1. 扩展块 Schema：图片、文件、Callout、Toggle、书签、公式、目录和嵌入。
2. 建立附件内容寻址存储、缩略图、垃圾回收和上传进度。
3. 完成 Notion HTML/Markdown/CSV/ZIP 条目流式转换、事务写入与可恢复导入报告（目录预检、内容解析和预检 UI 已完成）。
4. 增加页面历史、快照浏览、差异比较与恢复。
5. 建立权限过滤的全文/向量混合检索和 AI 引用定位。
6. 增加模板库、数据库关联/Rollup/公式和基础自动化。

## 已知技术债

- 浏览器开发预览仍使用版本化浏览器存储；正式 Electron 路径已使用 SQLite。
- 协作房间仍驻内存；生产版需要服务端持久化和横向扩展广播。
- AI 安全写入目前支持段落插入和选区替换，尚未开放删除与数据库修改。
- Windows 开发包已生成，但系统应用控制策略会拦截未签名的新二进制；正式发布需要代码签名证书。
