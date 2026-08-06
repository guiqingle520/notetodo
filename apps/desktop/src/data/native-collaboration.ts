import { generateJSON, getSchema, type Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Collaboration from '@tiptap/extension-collaboration'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import type * as Y from 'yjs'

export function documentSchemaExtensions(): Extensions {
  return [
    StarterKit.configure({ undoRedo: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ]
}

export function collaborativeExtensions(document: Y.Doc): Extensions {
  return [
    ...documentSchemaExtensions(),
    Collaboration.configure({ document, field: 'body' }),
  ]
}

/**
 * Collaboration intentionally ignores Tiptap's `content` option. Convert the
 * legacy HTML through the exact active schema before mounting the editor.
 */
export function migrateHtmlToNativeFragment(document: Y.Doc, html: string) {
  const fragment = document.getXmlFragment('body')
  if (fragment.length || !html) return false
  const extensions = documentSchemaExtensions()
  const json = generateJSON(html, extensions)
  prosemirrorJSONToYXmlFragment(getSchema(extensions), json, fragment)
  return true
}
