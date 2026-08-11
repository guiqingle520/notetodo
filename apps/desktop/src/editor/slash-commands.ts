import type { Editor } from '@tiptap/react'
import {
  Bookmark,
  Code2,
  Columns2,
  Columns3,
  Heading1,
  Heading2,
  List,
  ListCollapse,
  ListOrdered,
  ListTodo,
  ListTree,
  Lightbulb,
  Minus,
  PanelsTopLeft,
  Quote,
  Sigma,
  Type,
} from 'lucide-react'
import { createColumnLayoutContent, normalizeEmbedUrl, safeHttpsUrl } from './rich-blocks'

export interface SlashCommand {
  label: string
  hint: string
  keywords: string
  icon: React.ComponentType<{ size?: number }>
  run: (editor: Editor) => void
}

export const baseSlashCommands: SlashCommand[] = [
  {
    label: '正文',
    hint: '普通文本段落',
    keywords: 'text paragraph 正文 文本',
    icon: Type,
    run: (editor) => {
      editor.chain().focus().setParagraph().run()
    },
  },
  {
    label: '一级标题',
    hint: '页面主要章节',
    keywords: 'heading h1 标题',
    icon: Heading1,
    run: (editor) => {
      editor.chain().focus().setHeading({ level: 1 }).run()
    },
  },
  {
    label: '二级标题',
    hint: '页面次级章节',
    keywords: 'heading h2 标题',
    icon: Heading2,
    run: (editor) => {
      editor.chain().focus().setHeading({ level: 2 }).run()
    },
  },
  {
    label: '项目列表',
    hint: '无序信息列表',
    keywords: 'bullet list 项目 列表',
    icon: List,
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run()
    },
  },
  {
    label: '编号列表',
    hint: '有顺序的步骤',
    keywords: 'ordered list 编号 列表',
    icon: ListOrdered,
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run()
    },
  },
  {
    label: '待办事项',
    hint: '可以勾选的任务',
    keywords: 'todo task check 待办 任务',
    icon: ListTodo,
    run: (editor) => {
      editor.chain().focus().toggleTaskList().run()
    },
  },
  {
    label: '引用',
    hint: '突出一句重要的话',
    keywords: 'quote blockquote 引用',
    icon: Quote,
    run: (editor) => {
      editor.chain().focus().toggleBlockquote().run()
    },
  },
  {
    label: '代码块',
    hint: '保留格式的代码',
    keywords: 'code block 代码',
    icon: Code2,
    run: (editor) => {
      editor.chain().focus().toggleCodeBlock().run()
    },
  },
  {
    label: '提示框',
    hint: '突出背景、结论或提醒',
    keywords: 'callout note 提示 提醒',
    icon: Lightbulb,
    run: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'callout',
          attrs: { tone: 'note', icon: '✦' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '输入提示内容…' }] }],
        })
        .run()
    },
  },
  {
    label: '折叠内容',
    hint: '收纳可展开的详细信息',
    keywords: 'toggle details 折叠 展开',
    icon: ListCollapse,
    run: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'toggle',
          attrs: { title: '展开查看', open: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '输入折叠内容…' }] }],
        })
        .run()
    },
  },
  {
    label: '双栏布局',
    hint: '并排组织正文与资料',
    keywords: 'columns layout two 双栏 分栏 布局',
    icon: Columns2,
    run: (editor) => {
      editor.chain().focus().insertContent(createColumnLayoutContent(2)).run()
    },
  },
  {
    label: '三栏布局',
    hint: '创建紧凑的信息矩阵',
    keywords: 'columns layout three 三栏 分栏 布局',
    icon: Columns3,
    run: (editor) => {
      editor.chain().focus().insertContent(createColumnLayoutContent(3)).run()
    },
  },
  {
    label: '网页书签',
    hint: '保存带摘要的网址卡片',
    keywords: 'bookmark url 书签 链接',
    icon: Bookmark,
    run: (editor) => {
      const input = window.prompt('输入 HTTPS 网页地址')
      const url = safeHttpsUrl(input?.trim() ?? '')
      if (!url) return
      const parsed = new URL(url)
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'bookmark',
          attrs: {
            url,
            title: parsed.hostname.replace(/^www\./, ''),
            description: url,
            site: parsed.hostname,
          },
        })
        .run()
    },
  },
  {
    label: '公式',
    hint: '插入 KaTeX 块公式',
    keywords: 'formula math latex 公式 数学',
    icon: Sigma,
    run: (editor) => {
      const expression = window.prompt('输入 LaTeX 公式', 'E = mc^2')?.trim()
      if (expression)
        editor
          .chain()
          .focus()
          .insertContent({ type: 'formula', attrs: { expression: expression.slice(0, 5000) } })
          .run()
    },
  },
  {
    label: '页面目录',
    hint: '自动列出当前页面标题',
    keywords: 'toc contents 目录 大纲',
    icon: ListTree,
    run: (editor) => {
      editor.chain().focus().insertContent({ type: 'tableOfContents' }).run()
    },
  },
  {
    label: '嵌入',
    hint: '嵌入视频、设计稿或地图',
    keywords: 'embed iframe video 嵌入 视频',
    icon: PanelsTopLeft,
    run: (editor) => {
      const input = window.prompt('输入支持的 HTTPS 嵌入地址')
      const url = normalizeEmbedUrl(input?.trim() ?? '')
      if (url)
        editor
          .chain()
          .focus()
          .insertContent({ type: 'embed', attrs: { url, title: '嵌入内容' } })
          .run()
    },
  },
  {
    label: '分割线',
    hint: '分隔上下文',
    keywords: 'divider rule 分割线',
    icon: Minus,
    run: (editor) => {
      editor.chain().focus().setHorizontalRule().run()
    },
  },
]
