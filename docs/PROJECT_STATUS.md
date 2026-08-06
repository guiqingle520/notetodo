# Project Status

> 更新时间：2026-08-06

## 当前里程碑

Sync Foundation & AI Execution Alpha — **完成**

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

### 当前验证结果

- TypeScript：通过。
- Vitest：9 个测试文件、22 个测试通过。
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
- 全工作区：9 个测试文件、22 项测试通过。

## 下一里程碑

Collaboration UX & Safe AI Actions Beta

1. 将桌面会话连接 WebSocket，加入指数退避重连和离线队列确认游标。
2. 将 HTML 文本 CRDT 升级为 ProseMirror 原生 Yjs Fragment，实现块级多人光标。
3. 增加协作者头像、Presence、评论、@提及和页面分享设置。
4. 为 AI 增加上下文选择、引用卡片、结构化 Patch 预览、确认和撤销。
5. 建立页面 ACL、协作短期 JWT、刷新令牌和房间级权限校验。
6. 完成 20 人同页压力测试、断网重连测试与 AI 工具安全审计。

## 已知技术债

- 浏览器开发预览仍使用版本化浏览器存储；正式 Electron 路径已使用 SQLite。
- 当前编辑器以 HTML 字符串做最小范围 Y.Text 差分；需升级为 ProseMirror 原生 Fragment，才能提供完善的块级并发语义与多人选区。
- 协作服务当前使用开发期共享密钥且房间仅驻内存；生产版需要短期作用域 JWT、服务端持久化和横向扩展广播。
- AI 已可流式问答，但写入仍缺少结构化 Patch 预览、权限确认、引用和审计记录。
- Windows 开发包已生成，但系统应用控制策略会拦截未签名的新二进制；正式发布需要代码签名证书。
