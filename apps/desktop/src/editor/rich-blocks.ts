import { mergeAttributes, Node, type Extensions } from '@tiptap/core'
import Image from '@tiptap/extension-image'

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
  parseHTML() { return [{ tag: 'aside[data-notetodo-callout]' }] },
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
  parseHTML() { return [{ tag: 'details[data-notetodo-toggle]' }] },
  renderHTML({ HTMLAttributes }) {
    const { title, open, ...rest } = HTMLAttributes
    const attributes = mergeAttributes(rest, { 'data-notetodo-toggle': '', class: 'rich-toggle' })
    if (!open) delete attributes.open
    else attributes.open = ''
    return ['details', attributes, ['summary', { contenteditable: 'false' }, title], ['div', { class: 'toggle-content' }, 0]]
  },
})

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
})

export function richBlockExtensions(): Extensions {
  return [
    Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'rich-image' } }),
    CalloutBlock,
    ToggleBlock,
    FileBlock,
  ]
}

function formatFileMeta(mimeType: string, size: number | string | null) {
  const bytes = Number(size)
  const formatted = Number.isFinite(bytes) && bytes > 0
    ? bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : '大小未知'
  return `${mimeType || '文件'} · ${formatted}`
}
