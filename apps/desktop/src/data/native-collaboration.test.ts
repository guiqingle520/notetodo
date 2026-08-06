// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
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
})
