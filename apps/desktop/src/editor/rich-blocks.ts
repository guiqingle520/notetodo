import { mergeAttributes, Node, type Extensions } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { LinkedDatabaseBlock } from './linked-database'
import {
  assetHashFromUrl,
  clampImageWidth,
  formatFileMeta,
  hostLabel,
  normalizeEmbedUrl,
  safeHttpsUrl,
} from './rich-block-utils'

export { assetHashFromUrl, normalizeEmbedUrl, safeHttpsUrl } from './rich-block-utils'

const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      previewSrc: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-preview-src'),
        renderHTML: (attributes) => attributes.previewSrc ? { 'data-preview-src': attributes.previewSrc } : {},
      },
      width: {
        default: 100,
        parseHTML: (element) => clampImageWidth(Number(element.getAttribute('data-width') ?? 100)),
        renderHTML: (attributes) => ({ 'data-width': clampImageWidth(Number(attributes.width)) }),
      },
      caption: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-caption') ?? '',
        renderHTML: (attributes) => attributes.caption ? { 'data-caption': String(attributes.caption).slice(0, 500) } : {},
      },
    }
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('figure')
      dom.className = 'rich-image-frame'
      const image = document.createElement('img')
      image.className = 'rich-image'
      image.draggable = false
      const controls = document.createElement('div')
      controls.className = 'image-controls'
      controls.contentEditable = 'false'
      const sizeLabel = document.createElement('span')
      const range = document.createElement('input')
      range.type = 'range'; range.min = '35'; range.max = '100'; range.step = '5'; range.setAttribute('aria-label', '图片宽度')
      const caption = document.createElement('input')
      caption.className = 'image-caption'; caption.placeholder = '添加图片说明…'; caption.maxLength = 500; caption.setAttribute('aria-label', '图片说明')
      controls.append(sizeLabel, range)
      dom.append(image, controls, caption)
      let currentNode = node
      let loader: HTMLImageElement | undefined
      let captionTimer: number | undefined
      const updateAttributes = (attributes: Record<string, unknown>) => {
        if (!editor.isEditable) return
        const position = getPos()
        if (typeof position !== 'number') return
        editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...currentNode.attrs, ...attributes }))
      }
      const render = () => {
        const width = clampImageWidth(Number(currentNode.attrs.width))
        dom.style.width = `${width}%`
        image.alt = currentNode.attrs.alt ?? ''
        image.title = currentNode.attrs.title ?? ''
        image.dataset.previewSrc = currentNode.attrs.previewSrc ?? ''
        image.src = currentNode.attrs.previewSrc || currentNode.attrs.src
        range.value = String(width); sizeLabel.textContent = `${width}%`
        range.disabled = !editor.isEditable; caption.readOnly = !editor.isEditable
        if (document.activeElement !== caption) caption.value = currentNode.attrs.caption ?? ''
        if (currentNode.attrs.previewSrc && currentNode.attrs.src !== currentNode.attrs.previewSrc) {
          loader = new window.Image()
          const expectedSource = currentNode.attrs.src
          loader.onload = () => { if (currentNode.attrs.src === expectedSource) image.src = expectedSource }
          loader.src = expectedSource
        }
      }
      range.addEventListener('input', () => updateAttributes({ width: clampImageWidth(Number(range.value)) }))
      caption.addEventListener('input', () => {
        window.clearTimeout(captionTimer)
        captionTimer = window.setTimeout(() => updateAttributes({ caption: caption.value.slice(0, 500) }), 180)
      })
      caption.addEventListener('blur', () => { window.clearTimeout(captionTimer); updateAttributes({ caption: caption.value.slice(0, 500) }) })
      render()
      return {
        dom,
        update: (nextNode) => {
          if (nextNode.type !== currentNode.type) return false
          currentNode = nextNode
          render()
          return true
        },
        stopEvent: (event) => controls.contains(event.target as globalThis.Node) || caption.contains(event.target as globalThis.Node),
        ignoreMutation: () => true,
        destroy: () => { if (loader) loader.onload = null; window.clearTimeout(captionTimer) },
      }
    }
  },
})

/**
 * Rich blocks use schema-native attributes so they survive Yjs sync, history
 * snapshots and export without depending on React component state.
 */
export const CalloutBlock = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      tone: { default: 'note', parseHTML: (element) => element.getAttribute('data-tone') ?? 'note' },
      icon: { default: '✦', parseHTML: (element) => element.getAttribute('data-icon') ?? '✦' },
    }
  },
  parseHTML() { return [{ tag: 'aside[data-notetodo-callout]', contentElement: (element) => element.querySelector<HTMLElement>('.callout-content') ?? element }] },
  renderHTML({ HTMLAttributes }) {
    const { tone, icon, ...rest } = HTMLAttributes
    return ['aside', mergeAttributes(rest, {
      'data-notetodo-callout': '',
      'data-tone': tone,
      'data-icon': icon,
      class: 'rich-callout',
    }), ['span', { class: 'callout-glyph', contenteditable: 'false' }, icon], ['div', { class: 'callout-content' }, 0]]
  },
})

export const ToggleBlock = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      title: { default: '折叠内容', parseHTML: (element) => element.querySelector(':scope > summary')?.textContent ?? '折叠内容' },
      open: { default: true, parseHTML: (element) => element.hasAttribute('open') },
    }
  },
  parseHTML() {
    return [{
      tag: 'details[data-notetodo-toggle]',
      contentElement: (element) => {
        const renderedContent = element.querySelector<HTMLElement>('.toggle-content')
        if (renderedContent) return renderedContent
        // Raw Notion <details> has summary beside body nodes. Parse a detached
        // body clone so the summary remains an attribute, never duplicate text.
        const body = document.createElement('div')
        for (const child of element.childNodes) if (!(child instanceof HTMLElement && child.tagName === 'SUMMARY')) body.append(child.cloneNode(true))
        return body
      },
    }]
  },
  renderHTML({ HTMLAttributes }) {
    const { title, open, ...rest } = HTMLAttributes
    const attributes = mergeAttributes(rest, { 'data-notetodo-toggle': '', class: 'rich-toggle' })
    if (!open) delete attributes.open
    else attributes.open = ''
    return ['details', attributes, ['summary', { contenteditable: 'false' }, title], ['div', { class: 'toggle-content' }, 0]]
  },
})

const columnLayouts = new Set(['equal', 'wide-left', 'wide-right', 'focus-center'])

/**
 * Columns are schema-native container nodes. Their structure therefore travels
 * through Yjs, history snapshots and HTML export as one atomic page layout,
 * while every nested block remains directly editable by ProseMirror.
 */
export const ColumnLayoutBlock = Node.create({
  name: 'columnLayout',
  group: 'block',
  content: 'column{2,3}',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      layout: {
        default: 'equal',
        parseHTML: (element) => normalizeColumnLayout(element.getAttribute('data-layout')),
        renderHTML: (attributes) => ({ 'data-layout': normalizeColumnLayout(attributes.layout) }),
      },
    }
  },
  parseHTML() {
    return [{
      tag: 'section[data-notetodo-columns]',
      contentElement: (element) => element.querySelector<HTMLElement>('.column-layout-content') ?? element,
    }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, {
      'data-notetodo-columns': '',
      class: 'column-layout',
    }), ['div', { class: 'column-layout-content' }, 0]]
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('section')
      dom.className = 'column-layout'
      dom.dataset.notetodoColumns = ''
      const controls = document.createElement('div')
      controls.className = 'column-layout-controls'
      controls.contentEditable = 'false'
      controls.setAttribute('aria-label', '分栏宽度')
      const contentDOM = document.createElement('div')
      contentDOM.className = 'column-layout-content'
      dom.append(controls, contentDOM)
      let currentNode = node

      const presets = node.childCount === 3
        ? [['equal', '等宽'], ['wide-left', '左宽'], ['focus-center', '中宽']] as const
        : [['equal', '等宽'], ['wide-left', '左宽'], ['wide-right', '右宽']] as const
      const setLayout = (layout: string) => {
        if (!editor.isEditable) return
        const position = getPos()
        if (typeof position !== 'number') return
        editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...currentNode.attrs, layout }))
      }
      const render = () => {
        const layout = normalizeColumnLayout(currentNode.attrs.layout)
        dom.dataset.layout = layout
        controls.replaceChildren()
        for (const [value, label] of presets) {
          const button = document.createElement('button')
          button.type = 'button'; button.textContent = label; button.dataset.active = String(layout === value)
          button.disabled = !editor.isEditable
          button.addEventListener('click', () => setLayout(value))
          controls.append(button)
        }
      }
      render()
      return {
        dom,
        contentDOM,
        update: (nextNode) => {
          if (nextNode.type !== currentNode.type || nextNode.childCount !== currentNode.childCount) return false
          currentNode = nextNode; render(); return true
        },
        stopEvent: (event) => controls.contains(event.target as globalThis.Node),
        ignoreMutation: (mutation) => controls.contains(mutation.target),
      }
    }
  },
})

export const ColumnBlock = Node.create({
  name: 'column',
  content: 'block+',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-notetodo-column]' }] },
  renderHTML() { return ['div', { 'data-notetodo-column': '', class: 'column-layout-column' }, 0] },
})

export const PageMention = Node.create({
  name: 'pageMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      pageId: {
        default: '',
        parseHTML: (element) => pageIdFromMention(element.getAttribute('href') ?? element.getAttribute('data-page-id') ?? ''),
      },
      title: { default: '未命名页面', parseHTML: (element) => element.getAttribute('data-title') ?? element.textContent?.replace(/^@/u, '') ?? '未命名页面' },
    }
  },
  parseHTML() { return [{ tag: 'a[data-notetodo-page-mention]' }] },
  renderHTML({ HTMLAttributes }) {
    const pageId = pageIdFromMention(String(HTMLAttributes.pageId ?? ''))
    const title = String(HTMLAttributes.title ?? '未命名页面').slice(0, 200)
    return ['a', {
      'data-notetodo-page-mention': '',
      'data-page-id': pageId,
      'data-title': title,
      class: 'page-mention',
      href: `notetodo-page:${pageId}`,
    }, `@${title}`]
  },
})

export function createColumnLayoutContent(count: 2 | 3) {
  return {
    type: 'columnLayout',
    attrs: { layout: 'equal' },
    content: Array.from({ length: count }, (_, index) => ({
      type: 'column',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: index === 0 ? '开始书写…' : '继续补充…' }] }],
    })),
  }
}

export const FileBlock = Node.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null, parseHTML: (element) => element.getAttribute('href') },
      name: { default: '附件', parseHTML: (element) => element.getAttribute('data-name') ?? element.textContent ?? '附件' },
      size: { default: null, parseHTML: (element) => { const value = Number(element.getAttribute('data-size')); return Number.isFinite(value) ? value : null } },
      mimeType: { default: 'application/octet-stream', parseHTML: (element) => element.getAttribute('data-mime') ?? 'application/octet-stream' },
    }
  },
  parseHTML() { return [{ tag: 'a[data-notetodo-file]' }] },
  renderHTML({ HTMLAttributes }) {
    const { src, name, size, mimeType, ...rest } = HTMLAttributes
    return ['a', mergeAttributes(rest, {
      'data-notetodo-file': '',
      'data-name': name,
      'data-size': size,
      'data-mime': mimeType,
      class: 'rich-file',
      href: src,
      target: '_blank',
      rel: 'noreferrer',
    }), ['span', { class: 'file-monogram' }, 'FILE'], ['span', { class: 'file-copy' }, ['strong', {}, name], ['small', {}, formatFileMeta(mimeType, size)]]]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('article')
      dom.className = 'rich-file'
      const monogram = document.createElement('span'); monogram.className = 'file-monogram'; monogram.textContent = 'FILE'
      const copy = document.createElement('span'); copy.className = 'file-copy'
      const title = document.createElement('strong')
      const meta = document.createElement('small')
      copy.append(title, meta)
      const actions = document.createElement('span'); actions.className = 'file-actions'; actions.contentEditable = 'false'
      const open = document.createElement('button'); open.type = 'button'; open.textContent = '打开'
      const save = document.createElement('button'); save.type = 'button'; save.textContent = '导出'
      const status = document.createElement('em')
      actions.append(open, save, status); dom.append(monogram, copy, actions)
      let currentNode = node
      let statusTimer: number | undefined
      const showStatus = (message: string, error = false) => {
        status.textContent = message; status.dataset.error = error ? 'true' : 'false'
        window.clearTimeout(statusTimer); statusTimer = window.setTimeout(() => { status.textContent = '' }, 3200)
      }
      const run = async (operation: 'open' | 'export') => {
        const hash = assetHashFromUrl(currentNode.attrs.src)
        if (!hash || !window.notetodo?.attachments) return showStatus('仅桌面端可用', true)
        try {
          const result = await window.notetodo.attachments[operation](hash, currentNode.attrs.name)
          showStatus(operation === 'export' ? (result === false ? '已取消' : '已导出') : '已打开')
        } catch (error) { showStatus(error instanceof Error ? error.message.split('Error: ').at(-1) ?? error.message : '操作失败', true) }
      }
      open.addEventListener('click', () => { void run('open') }); save.addEventListener('click', () => { void run('export') })
      const render = () => { title.textContent = currentNode.attrs.name; meta.textContent = formatFileMeta(currentNode.attrs.mimeType, currentNode.attrs.size) }
      render()
      return {
        dom,
        update: (nextNode) => { if (nextNode.type !== currentNode.type) return false; currentNode = nextNode; render(); return true },
        stopEvent: (event) => actions.contains(event.target as globalThis.Node),
        ignoreMutation: () => true,
        destroy: () => window.clearTimeout(statusTimer),
      }
    }
  },
})

export const BookmarkBlock = Node.create({
  name: 'bookmark',
  priority: 1000,
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: '', parseHTML: (element) => safeHttpsUrl(element.getAttribute('href') ?? '') },
      title: { default: '网页书签', parseHTML: (element) => element.getAttribute('data-title') ?? element.textContent ?? '网页书签' },
      description: { default: '', parseHTML: (element) => element.getAttribute('data-description') ?? '' },
      site: { default: '', parseHTML: (element) => element.getAttribute('data-site') ?? '' },
    }
  },
  parseHTML() { return [{ tag: 'a[data-notetodo-bookmark]', priority: 1000 }] },
  renderHTML({ HTMLAttributes }) {
    const { url, title, description, site, ...rest } = HTMLAttributes
    return ['a', mergeAttributes(rest, {
      'data-notetodo-bookmark': '', 'data-title': title, 'data-description': description, 'data-site': site,
      class: 'rich-bookmark', href: safeHttpsUrl(url), target: '_blank', rel: 'noreferrer',
    }), ['span', { class: 'bookmark-copy' }, ['strong', {}, title], ['small', {}, description || url], ['em', {}, site || hostLabel(url)]], ['span', { class: 'bookmark-arrow' }, '↗']]
  },
})

export const FormulaBlock = Node.create({
  name: 'formula',
  group: 'block',
  atom: true,
  addAttributes() {
    return { expression: { default: 'E = mc^2', parseHTML: (element) => element.getAttribute('data-expression') ?? element.textContent ?? '' } }
  },
  parseHTML() { return [{ tag: 'figure[data-notetodo-formula]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['figure', { 'data-notetodo-formula': '', 'data-expression': HTMLAttributes.expression, class: 'rich-formula' }, ['code', {}, HTMLAttributes.expression]]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure')
      dom.className = 'rich-formula'
      dom.dataset.notetodoFormula = ''
      const render = (expression: string) => {
        dom.dataset.expression = expression
        dom.innerHTML = katex.renderToString(expression, { displayMode: true, throwOnError: false, strict: 'ignore', trust: false })
      }
      render(node.attrs.expression)
      return { dom, update: (nextNode) => { if (nextNode.type !== node.type) return false; render(nextNode.attrs.expression); return true } }
    }
  },
})

export const TableOfContentsBlock = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  parseHTML() { return [{ tag: 'nav[data-notetodo-toc]' }] },
  renderHTML() { return ['nav', { 'data-notetodo-toc': '', class: 'rich-toc' }, ['strong', {}, '页面目录']] },
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('nav')
      dom.className = 'rich-toc'
      dom.dataset.notetodoToc = ''
      let previousSignature = ''
      const render = (event?: { transaction?: { docChanged: boolean } }) => {
        // Cursor and presence transactions are frequent in collaborative pages;
        // rebuild the derived outline only when document content actually moves.
        if (event?.transaction && !event.transaction.docChanged) return
        const headings: Array<{ level: number; text: string }> = []
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'heading') headings.push({ level: node.attrs.level, text: node.textContent || '无标题章节' })
        })
        const signature = JSON.stringify(headings)
        if (signature === previousSignature) return
        previousSignature = signature
        dom.replaceChildren()
        const label = document.createElement('strong'); label.textContent = '页面目录'; dom.append(label)
        if (!headings.length) { const empty = document.createElement('small'); empty.textContent = '添加标题后将在这里生成目录'; dom.append(empty); return }
        headings.forEach((heading, index) => {
          const button = document.createElement('button')
          button.type = 'button'; button.textContent = heading.text; button.dataset.level = String(heading.level)
          button.addEventListener('click', () => editor.view.dom.querySelectorAll('h1,h2,h3')[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
          dom.append(button)
        })
      }
      editor.on('transaction', render); render()
      return { dom, ignoreMutation: () => true, destroy: () => editor.off('transaction', render) }
    }
  },
})

export const EmbedBlock = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: '', parseHTML: (element) => element.getAttribute('data-url') ?? element.getAttribute('src') ?? element.querySelector('iframe')?.getAttribute('src') ?? '' },
      title: { default: '嵌入内容', parseHTML: (element) => element.getAttribute('data-title') ?? element.getAttribute('title') ?? '嵌入内容' },
    }
  },
  parseHTML() { return [{ tag: 'figure[data-notetodo-embed]' }, { tag: 'iframe[src]' }] },
  renderHTML({ HTMLAttributes }) {
    const url = normalizeEmbedUrl(HTMLAttributes.url)
    const base = { 'data-notetodo-embed': '', 'data-url': url, 'data-title': HTMLAttributes.title, class: 'rich-embed' }
    return url
      ? ['figure', base, ['iframe', { src: url, title: HTMLAttributes.title, loading: 'lazy', sandbox: 'allow-scripts allow-same-origin allow-presentation', referrerpolicy: 'no-referrer' }]]
      : ['figure', mergeAttributes(base, { class: 'rich-embed is-blocked' }), ['strong', {}, '无法嵌入此网址'], ['small', {}, '仅支持 YouTube、Vimeo、Figma、Loom 和 Google Maps 的 HTTPS 地址。']]
  },
})

export function richBlockExtensions(): Extensions {
  return [
    RichImage.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'rich-image' } }),
    CalloutBlock,
    ToggleBlock,
    ColumnLayoutBlock,
    ColumnBlock,
    PageMention,
    LinkedDatabaseBlock,
    FileBlock,
    BookmarkBlock,
    FormulaBlock,
    TableOfContentsBlock,
    EmbedBlock,
  ]
}

function normalizeColumnLayout(value: unknown) {
  return typeof value === 'string' && columnLayouts.has(value) ? value : 'equal'
}

function pageIdFromMention(value: string) {
  const pageId = value.startsWith('notetodo-page:') ? value.slice('notetodo-page:'.length) : value
  return /^[a-zA-Z0-9_-]{1,128}$/u.test(pageId) ? pageId : ''
}
