# RFC 0001：Desktop Foundation

- 状态：Accepted
- 日期：2026-08-06

## 决策

首版桌面客户端采用 Electron、React、TypeScript 和 Vite。Renderer 禁止 Node Integration，启用 Context Isolation 与 Sandbox，所有系统能力只能通过类型化、白名单化的 Preload API 暴露。

编辑器基于 ProseMirror/Tiptap，后续以 Yjs 承载协作更新。本地持久化最终落在 SQLite；当前 UI Alpha 使用版本化的浏览器存储验证交互与领域模型，SQLite Repository 将在下一迭代替换该适配器。

## 理由

- Chromium 行为一致，降低复杂编辑器的跨平台差异。
- Electron 的窗口、更新、协议和企业安装能力成熟。
- React/TypeScript 可以在未来 Web 客户端复用领域层和 UI 组件。
- 通过清晰的 Preload 边界控制 Electron 的主要攻击面。

## 后果

- 接受更大的安装包和基础内存占用。
- 必须持续执行 Electron 安全检查和性能预算。
- 壳层与领域包分离，保留未来迁移 Tauri 的可能性。

