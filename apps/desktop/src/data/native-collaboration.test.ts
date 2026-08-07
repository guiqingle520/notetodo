// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { collaborativeExtensions, migrateHtmlToNativeFragment } from './native-collaboration'
import { RemoteCursors, renderRemoteCursors } from './remote-cursors'

function collaborativeEditor(document: Y.Doc, content = '') {
  return new Editor({
    extensions: [...collaborativeExtensions(document), RemoteCursors],
    content,
  })
}

function jsonText(node?: JSONContent): string {
  return node?.text ?? node?.content?.map(jsonText).join('') ?? ''
}

describe('native Tiptap collaboration document', () => {
  it('migrates HTML into a Y.XmlFragment and restores it on another client', () => {
    const source = new Y.Doc()
    migrateHtmlToNativeFragment(source, '<h1>协作页面</h1><p>原有正文不会丢失。</p>')
    const first = collaborativeEditor(source)
    expect(source.getXmlFragment('body').length).toBeGreaterThan(0)

    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(source))
    const second = collaborativeEditor(remote)
    expect(second.getHTML()).toContain('协作页面')
    expect(second.getHTML()).toContain('原有正文不会丢失。')
    first.destroy()
    second.destroy()
  })

  it('renders a remote caret label without injecting collaborator HTML', () => {
    const document = new Y.Doc()
    migrateHtmlToNativeFragment(document, '<p>多人协作内容</p>')
    const editor = collaborativeEditor(document)
    renderRemoteCursors(editor, [{ clientId: 'remote', name: '<img onerror=alert(1)> Ming', color: '#247a68', cursor: { anchor: 2, head: 2 } }])
    expect(editor.view.dom.querySelector('.remote-caret span')?.textContent).toBe('<img onerror=alert(1)> Ming')
    expect(editor.view.dom.querySelector('.remote-caret img')).toBeNull()
    editor.destroy()
  })

  it('deduplicates identical legacy migrations created independently offline', () => {
    const first = new Y.Doc()
    const second = new Y.Doc()
    const html = '<h1>同一旧页面</h1><p>离线设备分别迁移。</p>'
    migrateHtmlToNativeFragment(first, html)
    migrateHtmlToNativeFragment(second, html)
    const merged = Y.mergeUpdates([Y.encodeStateAsUpdate(first), Y.encodeStateAsUpdate(second)])
    const restored = new Y.Doc()
    Y.applyUpdate(restored, merged)
    const editor = collaborativeEditor(restored)
    expect(editor.getHTML().match(/同一旧页面/gu)).toHaveLength(1)
    editor.destroy(); first.destroy(); second.destroy(); restored.destroy()
  })

  it('round-trips image, file, callout and toggle blocks through Yjs', () => {
    const source = new Y.Doc()
    migrateHtmlToNativeFragment(source, `
      <aside data-notetodo-callout data-tone="warning" data-icon="!" class="rich-callout"><p>发布前检查</p></aside>
      <details data-notetodo-toggle open><summary>技术细节</summary><div><p>离线优先</p></div></details>
      <img src="notetodo-asset://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cover.png" alt="Cover">
      <a data-notetodo-file data-name="brief.pdf" data-size="2048" data-mime="application/pdf" href="notetodo-asset://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/brief.pdf">brief.pdf</a>
    `)
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(source))
    const editor = collaborativeEditor(remote)
    const json = editor.getJSON()

    expect(json.content?.map((node) => node.type).slice(0, 4)).toEqual(['callout', 'toggle', 'image', 'fileAttachment'])
    expect(json.content?.[0]?.attrs).toMatchObject({ tone: 'warning', icon: '!' })
    expect(json.content?.[1]?.attrs).toMatchObject({ title: '技术细节', open: true })
    expect(json.content?.[3]?.attrs).toMatchObject({ name: 'brief.pdf', size: 2048, mimeType: 'application/pdf' })
    editor.destroy(); source.destroy(); remote.destroy()
  })

  it('round-trips bookmark, formula, table of contents and embed blocks through Yjs', () => {
    const source = new Y.Doc()
    migrateHtmlToNativeFragment(source, `
      <a data-notetodo-bookmark data-title="Tiptap" data-description="Editor framework" data-site="tiptap.dev" href="https://tiptap.dev/">Tiptap</a>
      <figure data-notetodo-formula data-expression="c^2 = a^2 + b^2"><code>c^2 = a^2 + b^2</code></figure>
      <nav data-notetodo-toc><strong>页面目录</strong></nav>
      <figure data-notetodo-embed data-url="https://www.youtube.com/embed/dQw4w9WgXcQ" data-title="Video"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></figure>
    `)
    const editor = collaborativeEditor(source)
    const types = editor.getJSON().content?.map((node) => node.type) ?? []
    expect(types).toEqual(expect.arrayContaining(['bookmark', 'formula', 'tableOfContents', 'embed']))
    expect(editor.getJSON().content?.find((node) => node.type === 'formula')?.attrs?.expression).toBe('c^2 = a^2 + b^2')
    expect(editor.view.dom.querySelector('.rich-formula .katex')).not.toBeNull()
    editor.destroy(); source.destroy()
  })

  it('keeps decorative callout and toggle chrome out of content after repeated HTML migration', () => {
    const firstDocument = new Y.Doc()
    migrateHtmlToNativeFragment(firstDocument, '<aside data-notetodo-callout data-icon="✦"><p>正文</p></aside><details data-notetodo-toggle open><summary>标题</summary><p>细节</p></details>')
    const firstEditor = collaborativeEditor(firstDocument)
    const serialized = firstEditor.getHTML()
    const secondDocument = new Y.Doc()
    migrateHtmlToNativeFragment(secondDocument, serialized)
    const secondEditor = collaborativeEditor(secondDocument)

    const callout = secondEditor.getJSON().content?.find((node) => node.type === 'callout')
    const toggle = secondEditor.getJSON().content?.find((node) => node.type === 'toggle')
    expect(jsonText(callout)).toBe('正文')
    expect(jsonText(toggle)).toBe('细节')
    expect(secondEditor.getHTML().match(/callout-glyph/g)).toHaveLength(1)
    firstEditor.destroy(); secondEditor.destroy(); firstDocument.destroy(); secondDocument.destroy()
  })
})
