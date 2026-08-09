import type { Editor } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'

export type BlockAction = 'move-up' | 'move-down' | 'duplicate' | 'delete'

/**
 * Applies one top-level block operation in a single ProseMirror transaction.
 * One transaction means Yjs collaborators observe an atomic reorder instead
 * of an intermediate delete followed by a later insert.
 */
export function applyBlockAction(editor: Editor, index: number, action: BlockAction) {
  const { doc, tr } = editor.state
  if (!Number.isInteger(index) || index < 0 || index >= doc.childCount) return false
  const node = doc.child(index)
  const from = blockOffset(doc, index)

  if (action === 'duplicate') {
    editor.view.dispatch(tr.insert(from + node.nodeSize, node.copy(node.content)).scrollIntoView())
    return true
  }
  if (action === 'delete') {
    let replacement = Fragment.empty
    if (doc.childCount === 1) {
      const paragraph = editor.schema.nodes.paragraph
      if (!paragraph) return false
      replacement = Fragment.from(paragraph.create())
    }
    editor.view.dispatch(tr.replaceWith(from, from + node.nodeSize, replacement).scrollIntoView())
    return true
  }
  if (action === 'move-up' && index > 0) {
    const previous = doc.child(index - 1)
    const start = from - previous.nodeSize
    editor.view.dispatch(tr.replaceWith(start, from + node.nodeSize, Fragment.fromArray([node, previous])).scrollIntoView())
    return true
  }
  if (action === 'move-down' && index < doc.childCount - 1) {
    const next = doc.child(index + 1)
    editor.view.dispatch(tr.replaceWith(from, from + node.nodeSize + next.nodeSize, Fragment.fromArray([next, node])).scrollIntoView())
    return true
  }
  return false
}

function blockOffset(doc: Editor['state']['doc'], index: number) {
  let offset = 0
  for (let current = 0; current < index; current += 1) offset += doc.child(current).nodeSize
  return offset
}
