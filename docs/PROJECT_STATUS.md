# Project Status

> 更新时间：2026-08-07

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
- Markdown/HTML 条目顺序流式转换、危险 HTML 清洗与 CSV 类型化数据库生成。
- 页面树和数据库单事务写入、失败整体回滚、进度事件与主动取消。
- SQLite Schema v7：内容寻址附件、页面附件引用和可恢复导入任务账本。
- 附件流式 SHA-256 去重落盘、只读 `notetodo-asset` 协议与严格 CSP。
- 导入页面/附件相对链接重写、本地页面跳转和未解析链接统计。
- 应用异常退出后的导入任务自动标记失败，迁移台展示最近导入账本。
- 富内容块第一批：原生 Image、File、Callout、Toggle 节点进入统一 Tiptap/Yjs Schema。
- Notion Aside/Details/附件链接规范化为可编辑富内容节点，Callout/Toggle 加入 Slash 菜单。
- 富内容块第二批：Bookmark、KaTeX Formula、动态 Table of Contents 和安全 Embed 节点。
- HTTPS 书签白名单、受支持嵌入来源与 iframe sandbox；目录仅在正文变更时增量重建。
- Electron 原生图片/文件多选，Preload 白名单桥接以及编辑器 Slash 插入交互。
- 本地附件流式 SHA-256 入库、按哈希去重、事务化页面引用和逐字节上传进度。
- 图片魔数嗅探、单文件/单批资源限制，以及不向 Renderer 暴露源文件路径。
- 原生图片缩略图、导入图片惰性预览生成和原图无损回退。
- 页面保存时自动核对附件引用，七天宽限期后隔离并回收零引用原件与缩略图。
- 编辑器文件拖放、剪贴板截图粘贴及隔离 Preload 文件路径转换。
- 块级悬浮工具栏：原子上移、下移、复制与删除，操作直接进入 Yjs 协作事务。
- 剪贴板内存附件采用 25 MB 单项、100 MB 单批限制及自动临时文件清理。
- 图片 35%–100% 尺寸标尺、协作同步说明文字和渐进式原图替换。
- 文件卡片安全打开与系统保存导出；危险可执行/脚本附件仅允许导出。
- 协作文件名末级净化，打开缓存和导出默认路径无法被 `../` 逃逸。

### 当前验证结果

- TypeScript：通过。
- Vitest：17 个测试文件、66 个测试通过。
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
- Markdown/HTML/CSV 顺序转换、脚本清洗、父子层级和导入事务回滚：通过。
- 附件哈希落盘、页面/附件链接重写、Schema v7 导入恢复：通过。
- Image/File/Callout/Toggle 经 HTML → ProseMirror → Yjs → 远端编辑器往返：通过。
- Callout Slash 插入、编辑状态和暖纸视觉 Chromium 验收：通过。
- Bookmark/Formula/TOC/Embed 的 Yjs 往返、URL 协议与嵌入来源安全测试：通过。
- 富内容装饰 DOM 多次 HTML/Yjs 迁移不重复正文：通过。
- 动态目录 Slash 插入、标题派生和 Chromium 视觉验收：通过。
- 本地附件流式哈希、重复内容去重、图片类型嗅探和大小限制：通过。
- 正文附件引用核对、仍在使用的资源保护和零引用原件/缩略图回收：通过。
- 顶层块双向移动、复制、删除和仅剩单块时的合法空文档回退：通过。
- 图片尺寸/说明 Yjs 往返、附件 URL 哈希校验和协作文件名路径逃逸防护：通过。
- 隔离 Electron 烟雾测试：Schema v7、CSP、Preload、SQLite 与协作票据链路通过，退出码 0。
- 全工作区：17 个测试文件、66 项测试通过。

## 当前里程碑余项

Content Parity, Import & Retrieval Alpha

1. 富内容块、图片尺寸/说明、文件打开导出以及 Slash/拖放/粘贴交互已完成。
2. 附件内容寻址存储、上传进度、缩略图、引用核对与宽限垃圾回收已完成。
3. Notion ZIP/HTML/Markdown/CSV、附件、链接重写、事务写入、进度取消和可恢复报告已完成。
4. 增加页面历史、快照浏览、差异比较与恢复。
5. 建立权限过滤的全文/向量混合检索和 AI 引用定位。
6. 增加模板库、数据库关联/Rollup/公式和基础自动化。

## 已知技术债

- 浏览器开发预览仍使用版本化浏览器存储；正式 Electron 路径已使用 SQLite。
- 协作房间仍驻内存；生产版需要服务端持久化和横向扩展广播。
- AI 安全写入目前支持段落插入和选区替换，尚未开放删除与数据库修改。
- Windows 开发包已生成，但系统应用控制策略会拦截未签名的新二进制；正式发布需要代码签名证书。
