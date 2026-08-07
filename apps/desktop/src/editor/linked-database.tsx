import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { ArrowUpRight, Database } from 'lucide-react'
import { DatabaseBlock } from '../DatabaseBlock'
import { useWorkspace } from '../store'

/**
 * A linked database stores only the source page identity in the document.
 * Records remain in the canonical database tables, so editing an embedded view
 * never forks data or bloats the collaborative Yjs update stream.
 */
export const LinkedDatabaseBlock = Node.create({
  name: 'linkedDatabase',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      sourcePageId: { default: '', parseHTML: (element) => safeSourcePageId(element.getAttribute('data-source-page-id')) },
      sourceTitle: { default: '关联数据库', parseHTML: (element) => (element.getAttribute('data-source-title') ?? '关联数据库').slice(0, 200) },
    }
  },
  parseHTML() { return [{ tag: 'section[data-notetodo-linked-database]' }] },
  renderHTML({ HTMLAttributes }) {
    const sourcePageId = safeSourcePageId(HTMLAttributes.sourcePageId)
    const sourceTitle = String(HTMLAttributes.sourceTitle ?? '关联数据库').slice(0, 200)
    return ['section', mergeAttributes({
      'data-notetodo-linked-database': '',
      'data-source-page-id': sourcePageId,
      'data-source-title': sourceTitle,
      class: 'linked-database-block',
    }), ['strong', {}, sourceTitle]]
  },
  addNodeView() { return ReactNodeViewRenderer(LinkedDatabaseView) },
})

function LinkedDatabaseView({ node, selected }: NodeViewProps) {
  const setActivePage = useWorkspace((state) => state.setActivePage)
  const sourcePageId = safeSourcePageId(node.attrs.sourcePageId)
  const sourceTitle = String(node.attrs.sourceTitle ?? '关联数据库').slice(0, 200)

  return (
    <NodeViewWrapper
      as="section"
      className={`linked-database-block ${selected ? 'is-selected' : ''}`}
      data-source-page-id={sourcePageId}
      contentEditable={false}
    >
      <header className="linked-database-head">
        <span><Database size={13} /><small>关联数据库</small><strong>{sourceTitle}</strong></span>
        <button type="button" onClick={() => sourcePageId && setActivePage(sourcePageId)}>打开源页面 <ArrowUpRight size={12} /></button>
      </header>
      {sourcePageId ? <DatabaseBlock pageId={sourcePageId} /> : <p className="linked-database-error">关联的数据源已失效。</p>}
    </NodeViewWrapper>
  )
}

function safeSourcePageId(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(value) ? value : ''
}
