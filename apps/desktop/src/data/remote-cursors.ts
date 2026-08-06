import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface RemoteCursor { clientId: string; name: string; color: string; cursor?: { anchor: number; head: number } }
const cursorKey = new PluginKey<DecorationSet>('notetodo-remote-cursors')

export const RemoteCursors = Extension.create({
  name: 'notetodoRemoteCursors',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: cursorKey,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, previous) {
          const users = transaction.getMeta(cursorKey) as RemoteCursor[] | undefined
          if (!users) return previous.map(transaction.mapping, transaction.doc)
          const maximum = transaction.doc.content.size
          const decorations = users.flatMap((user) => {
            if (!user.cursor) return []
            const anchor = Math.max(1, Math.min(maximum, user.cursor.anchor))
            const head = Math.max(1, Math.min(maximum, user.cursor.head))
            const selection = anchor === head ? [] : [Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), { class: 'remote-selection', style: `--remote-color:${user.color}` })]
            const caret = Decoration.widget(head, () => {
              const marker = document.createElement('span')
              marker.className = 'remote-caret'
              marker.style.setProperty('--remote-color', user.color)
              const label = document.createElement('span')
              label.textContent = user.name
              marker.append(label)
              return marker
            }, { key: user.clientId })
            return [...selection, caret]
          })
          return DecorationSet.create(transaction.doc, decorations)
        },
      },
      props: { decorations: (state) => cursorKey.getState(state) },
    })]
  },
})

export function renderRemoteCursors(editor: Editor | null, users: RemoteCursor[]) {
  if (!editor) return
  editor.view.dispatch(editor.state.tr.setMeta(cursorKey, users))
}
