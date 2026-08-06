# NoteTodo

桌面优先、离线优先、模型与工具完全可插拔的知识和工作管理平台。

## 当前阶段

项目处于 Desktop Alpha 工程基座阶段。当前包含：

- Electron 安全壳与 React 工作区界面
- 页面树、收藏、最近访问与快捷搜索
- 基于 Tiptap/ProseMirror 的块编辑器基线
- 可收起的 AI 工作副驾驶
- 本地工作区状态持久化
- TypeScript、Vitest 和生产构建门禁

完整路线见 [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)。

## 开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm run check
```

## 目录

```text
apps/desktop       Electron 主进程、Preload 和 React Renderer
packages/          后续共享 Editor、Database、Sync、AI 和权限模块
docs/              产品与工程文档
rfcs/              关键架构决策
```

