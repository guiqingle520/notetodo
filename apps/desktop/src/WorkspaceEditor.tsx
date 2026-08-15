import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Grid2X2, Image as ImageIcon, Paperclip } from 'lucide-react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { pageBreadcrumbs, type WorkspacePage } from './domain'
import { useWorkspace } from './store'
import { PageDatabaseMount } from './DatabaseMount'
import { CommentsPanel, PageHistoryPanel, SharePanel } from './AppPanels'
import { PageSyncSession } from './data/page-sync'
import { documentSchemaExtensions, migrateHtmlToNativeFragment } from './data/native-collaboration'
import { RemoteCursors, renderRemoteCursors, type RemoteCursor } from './data/remote-cursors'
import { applyBlockAction, type BlockAction } from './editor/block-actions'
import { findDirectEditorBlock, isEditorCompositionEvent, placeEditorMenu, shouldFocusEditorCanvas } from './editor/editor-canvas'
import { useEditorMenuDismissal } from './editor/use-editor-menu-dismissal'
import { useEditorMenuKeyboard } from './editor/use-editor-menu-keyboard'
import { connectEditorPopup } from './editor/editor-popup-accessibility'
import { useEditorAttachments } from './editor/use-editor-attachments'
import { baseSlashCommands, type SlashCommand } from './editor/slash-commands'
import type { SelectionContext } from './AppAIPanel'
import { EditorPageProperties } from './EditorPageProperties'
import { PageHeaderActions, PageMetaActions } from './EditorPageActions'
import { AttachmentProgress, BlockToolbar, EditorDropGuide, PageMentionMenu, SlashCommandMenu, type EditorMenuState } from './EditorFloatingSurfaces'
import { PageCover } from './PageCover'
import { PageIcon } from './PageIcon'
import { PageTitle } from './PageTitle'
import { PageDescription } from './PageDescription'
import { PageBreadcrumbs } from './PageBreadcrumbs'

export function WorkspaceEditor(props: { onEditorReady: (editor: Editor | null) => void; onSelectionChange: (selection: SelectionContext | null) => void }) {
  const { pages, activePageId } = useWorkspace()
  const page = pages.find((candidate) => candidate.id === activePageId) ?? pages[0]
  if (!page) {
    return (
      <main className="workspace-main">
        <div className="empty-state">工作区暂时没有可显示的页面。</div>
      </main>
    )
  }
  return <WorkspaceEditorContent {...props} page={page} />
}
function WorkspaceEditorContent({ page, onEditorReady, onSelectionChange }: { page: WorkspacePage; onEditorReady: (editor: Editor | null) => void; onSelectionChange: (selection: SelectionContext | null) => void }) {
  const { pages, updatePage, toggleFavorite, archivePage, setActivePage } = useWorkspace()
  const breadcrumbs = useMemo(() => pageBreadcrumbs(pages, page.id), [pages, page.id])
  const isDatabasePage = page.icon === 'grid' && page.content.includes('data-notetodo-page-layout="database"')
  const [slashMenu, setSlashMenu] = useState<EditorMenuState | null>(null)
  const slashMenuId = useId()
  const slashMenuRef = useRef(slashMenu)
  const [pageMentionMenu, setPageMentionMenu] = useState<EditorMenuState | null>(null)
  const pageMentionMenuId = useId()
  const pageMentionMenuRef = useRef(pageMentionMenu)
  const [syncSession, setSyncSession] = useState<PageSyncSession | null>(null)
  const loadingDocument = useMemo(() => new Y.Doc(), [page.id])
  const [syncState, setSyncState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [collaborationState, setCollaborationState] = useState<'local' | 'connecting' | 'online' | 'offline'>('local')
  const [collaborators, setCollaborators] = useState<RemoteCursor[]>([])
  const [shareOpen, setShareOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pageRole, setPageRole] = useState<'viewer' | 'commenter' | 'editor' | 'owner'>('owner')
  const [blockToolbar, setBlockToolbar] = useState<null | { index: number; top: number }>(null)
  const [descriptionOpen, setDescriptionOpen] = useState(Boolean(page.description))
  const [descriptionFocusRequest, setDescriptionFocusRequest] = useState(0)
  const localEditorRef = useRef<Editor | null>(null)
  const { uploadState, dropActive, setDropActive, pickAndInsert, pickCover, storeDropped } = useEditorAttachments(page.id, (cover) => updatePage(page.id, { cover }))
  slashMenuRef.current = slashMenu
  pageMentionMenuRef.current = pageMentionMenu

  useEffect(() => setDescriptionOpen(Boolean(page.description)), [page.id])
  const openDescription = () => {
    setDescriptionOpen(true)
    setDescriptionFocusRequest((request) => request + 1)
  }
  const dismissEditorMenus = useCallback(() => {
    setSlashMenu(null)
    setPageMentionMenu(null)
  }, [])
  useEditorMenuDismissal(Boolean(slashMenu || pageMentionMenu), dismissEditorMenus)

  const databaseSourcePage = pages.find((candidate) => candidate.id === 'projects')
  const slashCommands = useMemo<SlashCommand[]>(
    () => [
      ...baseSlashCommands,
      {
        label: '关联数据库',
        hint: '嵌入产品路线的实时视图',
        keywords: 'linked database 关联 数据库 视图',
        icon: Grid2X2,
        run: (activeEditor) => {
          if (databaseSourcePage)
            activeEditor
              .chain()
              .focus()
              .insertContent({
                type: 'linkedDatabase',
                attrs: {
                  sourcePageId: databaseSourcePage.id,
                  sourceTitle: databaseSourcePage.title,
                },
              })
              .run()
        },
      },
      {
        label: '本地图片',
        hint: '选择图片并安全存入工作区',
        keywords: 'image photo upload 图片 上传',
        icon: ImageIcon,
        run: (activeEditor) => {
          void pickAndInsert(activeEditor, 'image')
        },
      },
      {
        label: '本地文件',
        hint: '附加文档、压缩包或媒体',
        keywords: 'file attachment upload 文件 附件 上传',
        icon: Paperclip,
        run: (activeEditor) => {
          void pickAndInsert(activeEditor, 'file')
        },
      },
    ],
    [page.id, databaseSourcePage?.id, databaseSourcePage?.title],
  )

  const filteredSlashCommands = useMemo(() => {
    const query = slashMenu?.query.toLocaleLowerCase() ?? ''
    return slashCommands.filter((command) => `${command.label} ${command.keywords}`.toLocaleLowerCase().includes(query))
  }, [slashMenu?.query, slashCommands])

  const mentionedPages = useMemo(() => {
    const query = pageMentionMenu?.query.trim().toLocaleLowerCase() ?? ''
    return pages.filter((candidate) => !candidate.archivedAt && candidate.id !== page.id && (!query || candidate.title.toLocaleLowerCase().includes(query))).slice(0, 8)
  }, [page.id, pageMentionMenu?.query, pages])

  const editor = useEditor(
    {
      extensions: [
        ...documentSchemaExtensions(),
        Placeholder.configure({ placeholder: "输入 '/' 插入内容，或直接开始书写…" }),
        Collaboration.configure({
          document: syncSession?.document ?? loadingDocument,
          field: 'body',
        }),
        RemoteCursors,
      ],
      content: syncSession?.initialContent(page.content) ?? '',
      editable: Boolean(syncSession) && ['editor', 'owner'].includes(pageRole),
      immediatelyRender: false,
      editorProps: {
        handleClick: (_view, _position, event) => {
          const anchor = (event.target as HTMLElement).closest('a[href^="notetodo-page:"]')
          const href = anchor?.getAttribute('href')
          if (!href) return false
          const targetPageId = href.slice('notetodo-page:'.length)
          if (!pages.some((candidate) => candidate.id === targetPageId)) return false
          event.preventDefault()
          setActivePage(targetPageId)
          return true
        },
        handleKeyDown: (view, event) => {
          if (isEditorCompositionEvent(event) || !['/', '@'].includes(event.key) || !view.state.selection.empty) return false
          const position = view.state.selection.from
          const coordinates = view.coordsAtPos(position)
          const menuPosition = placeEditorMenu({
            anchorLeft: coordinates.left,
            anchorTop: coordinates.top,
            anchorBottom: coordinates.bottom,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          })
          const nextMenu = {
            from: position,
            ...menuPosition,
            query: '',
            index: 0,
          }
          if (event.key === '/') {
            setSlashMenu(nextMenu)
            setPageMentionMenu(null)
          } else {
            setPageMentionMenu(nextMenu)
            setSlashMenu(null)
          }
          return false
        },
        handleDrop: (view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? [])
          if (!files.length || !window.notetodo?.attachments || !localEditorRef.current?.isEditable) return false
          event.preventDefault()
          const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
          const activeEditor = localEditorRef.current
          if (!activeEditor) return true
          if (coordinates) activeEditor.commands.setTextSelection(coordinates.pos)
          void storeDropped(activeEditor, files)
          return true
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
          if (!files.length || !window.notetodo?.attachments || !localEditorRef.current?.isEditable) return false
          event.preventDefault()
          const activeEditor = localEditorRef.current
          if (activeEditor) void storeDropped(activeEditor, files)
          return true
        },
      },
      onUpdate: ({ editor: activeEditor }) => {
        // A full-page database stores its layout marker in the page document.
        // The hidden rich-text editor must not normalize that marker away.
        if (isDatabasePage) return
        const content = activeEditor.getHTML()
        updatePage(page.id, { content })
        const menu = slashMenuRef.current
        const cursor = activeEditor.state.selection.from
        if (menu) {
          const typed = activeEditor.state.doc.textBetween(menu.from, cursor, '\n', '\0')
          if (typed.startsWith('/') && !/\s/u.test(typed)) setSlashMenu((current) => (current ? { ...current, query: typed.slice(1), index: 0 } : null))
          else setSlashMenu(null)
        }
        const mentionMenu = pageMentionMenuRef.current
        if (mentionMenu) {
          const typed = activeEditor.state.doc.textBetween(mentionMenu.from, cursor, '\n', '\0')
          if (typed.startsWith('@') && !/\s/u.test(typed)) setPageMentionMenu((current) => (current ? { ...current, query: typed.slice(1), index: 0 } : null))
          else setPageMentionMenu(null)
        }
      },
      onSelectionUpdate: ({ editor: activeEditor }) => {
        const selection = activeEditor.state.selection
        syncSession?.updatePresence({ anchor: selection.anchor, head: selection.head })
        onSelectionChange(
          selection.empty
            ? null
            : {
                from: selection.from,
                to: selection.to,
                text: activeEditor.state.doc.textBetween(selection.from, selection.to, ' '),
              },
        )
      },
    },
    [page.id, syncSession, loadingDocument, pageRole, isDatabasePage],
  )
  localEditorRef.current = editor

  useEffect(() => {
    const editorElement = editor?.view.dom
    if (!editorElement) return
    if (slashMenu) {
      const activeItemId = filteredSlashCommands[slashMenu.index] ? `${slashMenuId}-item-${slashMenu.index}` : null
      return connectEditorPopup(editorElement, slashMenuId, activeItemId)
    }
    if (pageMentionMenu) {
      const activeItemId = mentionedPages[pageMentionMenu.index] ? `${pageMentionMenuId}-item-${pageMentionMenu.index}` : null
      return connectEditorPopup(editorElement, pageMentionMenuId, activeItemId)
    }
  }, [editor, filteredSlashCommands, mentionedPages, pageMentionMenu, pageMentionMenuId, slashMenu, slashMenuId])

  const trackHoveredBlock = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editor?.isEditable) return
    const root = editor.view.dom
    const block = findDirectEditorBlock(root, event.target)
    if (!block) {
      setBlockToolbar(null)
      return
    }
    const index = Array.from(root.children).indexOf(block)
    if (index < 0) return
    const documentElement = root.closest('.document')
    if (!documentElement) return
    const blockRect = block.getBoundingClientRect()
    const documentRect = documentElement.getBoundingClientRect()
    setBlockToolbar((current) => (current?.index === index && Math.abs(current.top - (blockRect.top - documentRect.top)) < 1 ? current : { index, top: blockRect.top - documentRect.top }))
  }

  const runBlockAction = (action: BlockAction) => {
    if (!editor || !blockToolbar) return
    const moved = applyBlockAction(editor, blockToolbar.index, action)
    if (!moved) return
    setBlockToolbar((current) => {
      if (!current) return null
      if (action === 'move-up') return { ...current, index: Math.max(0, current.index - 1) }
      if (action === 'move-down') return { ...current, index: Math.min(editor.state.doc.childCount - 1, current.index + 1) }
      if (action === 'delete') return null
      return current
    })
  }

  const runSlashCommand = (command: SlashCommand) => {
    if (!editor || !slashMenu) return
    const cursor = editor.state.selection.from
    editor.chain().focus().deleteRange({ from: slashMenu.from, to: cursor }).run()
    command.run(editor)
    setSlashMenu(null)
  }

  const insertPageMention = (mentionedPage: WorkspacePage) => {
    if (!editor || !pageMentionMenu) return
    const cursor = editor.state.selection.from
    editor
      .chain()
      .focus()
      .deleteRange({ from: pageMentionMenu.from, to: cursor })
      .insertContent([
        { type: 'pageMention', attrs: { pageId: mentionedPage.id, title: mentionedPage.title } },
        { type: 'text', text: ' ' },
      ])
      .run()
    setPageMentionMenu(null)
  }

  useEffect(() => {
    onEditorReady(editor)
    return () => onEditorReady(null)
  }, [editor, onEditorReady])
  useEffect(() => renderRemoteCursors(editor, collaborators), [editor, collaborators])

  useEditorMenuKeyboard({
    open: Boolean(slashMenu),
    itemCount: filteredSlashCommands.length,
    selectedIndex: slashMenu?.index ?? 0,
    onMove: (direction) =>
      setSlashMenu((current) =>
        current
          ? {
              ...current,
              index: (current.index + direction + filteredSlashCommands.length) % filteredSlashCommands.length,
            }
          : null,
      ),
    onSelect: (index) => {
      const command = filteredSlashCommands[index]
      if (command) runSlashCommand(command)
    },
    onClose: () => setSlashMenu(null),
  })
  useEditorMenuKeyboard({
    open: Boolean(pageMentionMenu),
    itemCount: mentionedPages.length,
    selectedIndex: pageMentionMenu?.index ?? 0,
    onMove: (direction) =>
      setPageMentionMenu((current) =>
        current
          ? {
              ...current,
              index: (current.index + direction + mentionedPages.length) % mentionedPages.length,
            }
          : null,
      ),
    onSelect: (index) => {
      const mentionedPage = mentionedPages[index]
      if (mentionedPage) insertPageMention(mentionedPage)
    },
    onClose: () => setPageMentionMenu(null),
  })

  useEffect(() => {
    let active = true
    let session: PageSyncSession | undefined
    let disconnectCollaboration: (() => void) | undefined
    setSyncState('loading')
    setCollaborationState('local')
    setCollaborators([])
    void PageSyncSession.open(page.id, page.content)
      .then((opened) => {
        if (!active) return void opened.dispose()
        session = opened
        const legacyContent = opened.initialContent(page.content) ?? ''
        migrateHtmlToNativeFragment(opened.document, legacyContent)
        setSyncSession(opened)
        opened.subscribeState(setSyncState)
        if (window.notetodo?.collaboration) {
          void window.notetodo.collaboration.getTicket(page.id).then((ticket) => {
            if (!active) return
            if (!ticket) {
              return
            }
            setPageRole(ticket.role)
            setCollaborators([{ clientId: ticket.userId, name: ticket.name, color: ticket.color }])
            disconnectCollaboration = opened.connectCollaboration(ticket, {
              refreshTicket: () => window.notetodo!.collaboration.getTicket(page.id),
              onSeedRequired: () => migrateHtmlToNativeFragment(opened.document, legacyContent),
              onState: (state) => setCollaborationState(state === 'online' ? 'online' : state === 'offline' ? 'offline' : 'connecting'),
              onPresence: (presence) =>
                setCollaborators((current) => {
                  if (presence.clientId === ticket.userId) return current
                  return 'left' in presence ? current.filter((person) => person.clientId !== presence.clientId) : [...current.filter((person) => person.clientId !== presence.clientId), presence]
                }),
            })
          })
        }
      })
      .catch(() => active && setSyncState('error'))
    return () => {
      active = false
      disconnectCollaboration?.()
      setSyncSession((current) => (current === session ? null : current))
      if (session) void session.dispose()
    }
  }, [page.id])

  return (
    <main className="workspace">
      <header className="topbar">
        <PageBreadcrumbs pages={breadcrumbs} onNavigate={setActivePage} />
        <PageHeaderActions syncState={syncState} collaborationState={collaborationState} collaborators={collaborators} favorite={Boolean(page.favorite)} onComments={() => setCommentsOpen(true)} onHistory={() => setHistoryOpen(true)} onShare={() => setShareOpen(true)} onToggleFavorite={() => toggleFavorite(page.id)} onArchive={() => archivePage(page.id)} />
      </header>

      <div className="editor-scroll" onScroll={dismissEditorMenus}>
        <article className={`document ${isDatabasePage ? 'is-database-page' : ''}`} onMouseLeave={() => setBlockToolbar(null)}>
          {!isDatabasePage && page.cover && <PageCover source={page.cover} onChange={() => void pickCover()} onRemove={() => updatePage(page.id, { cover: '' })} />}
          <div className="document-kicker">
            <span>NT / {page.id.slice(0, 4).toUpperCase()}</span>
            <span>{new Date(page.updatedAt).toLocaleDateString('zh-CN')}</span>
          </div>
          <header className="page-heading">
            {!isDatabasePage && <PageIcon icon={page.icon} onChange={(icon) => updatePage(page.id, { icon })} />}
            {!isDatabasePage && <PageMetaActions hasCover={Boolean(page.cover)} hasDescription={Boolean(page.description)} onCoverRequest={() => void pickCover()} onDescriptionRequest={openDescription} />}
            <PageTitle value={page.title} onChange={(title) => updatePage(page.id, { title })} onSubmit={() => editor?.chain().focus('start').run()} />
            {!isDatabasePage && descriptionOpen && <PageDescription value={page.description ?? ''} focusRequest={descriptionFocusRequest} onChange={(description) => updatePage(page.id, { description })} onEmptyBlur={() => setDescriptionOpen(false)} onSubmit={() => editor?.chain().focus('start').run()} />}
          </header>
          {!isDatabasePage && <EditorPageProperties page={page} collaborators={collaborators} onAddParticipant={() => setShareOpen(true)} />}
          {!isDatabasePage && (
            <div
              className={`editor-stage ${dropActive ? 'is-drop-active' : ''}`}
              onMouseDown={(event) => {
                if (!editor?.isEditable || !shouldFocusEditorCanvas(event)) return
                event.preventDefault()
                editor.chain().focus('end').run()
              }}
              onMouseMove={trackHoveredBlock}
              onDragEnter={(event) => {
                if (editor?.isEditable && window.notetodo?.attachments && event.dataTransfer.types.includes('Files')) setDropActive(true)
              }}
              onDragOver={(event) => {
                if (editor?.isEditable && window.notetodo?.attachments && event.dataTransfer.types.includes('Files')) event.preventDefault()
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false)
              }}
            >
              <EditorContent editor={editor} className="editor-content" />
              {dropActive && <EditorDropGuide />}
            </div>
          )}
          {!isDatabasePage && blockToolbar && editor?.isEditable && <BlockToolbar top={blockToolbar.top} index={blockToolbar.index} childCount={editor.state.doc.childCount} onAction={runBlockAction} />}
          {uploadState && <AttachmentProgress state={uploadState} />}
          <PageDatabaseMount pageId={page.id} pageTitle={page.title} canEdit={Boolean(editor?.isEditable)} fullPage={isDatabasePage} />
          {!isDatabasePage && slashMenu && <SlashCommandMenu id={slashMenuId} state={slashMenu} commands={filteredSlashCommands} onSelect={runSlashCommand} onHighlight={(index) => setSlashMenu((current) => (current && current.index !== index ? { ...current, index } : current))} />}
          {!isDatabasePage && pageMentionMenu && <PageMentionMenu id={pageMentionMenuId} state={pageMentionMenu} pages={mentionedPages} allPages={pages} onSelect={insertPageMention} onHighlight={(index) => setPageMentionMenu((current) => (current && current.index !== index ? { ...current, index } : current))} />}
          {!isDatabasePage && (
            <div className="document-end">
              <span />
              END OF PAGE
              <span />
            </div>
          )}
        </article>
      </div>
      {shareOpen && <SharePanel pageId={page.id} onClose={() => setShareOpen(false)} />}
      {commentsOpen && <CommentsPanel pageId={page.id} editor={editor} onClose={() => setCommentsOpen(false)} />}
      {historyOpen && (
        <PageHistoryPanel
          page={page}
          canRestore={Boolean(editor?.isEditable)}
          onClose={() => setHistoryOpen(false)}
          onRestored={(restored) => {
            editor?.commands.setContent(restored.content)
            updatePage(restored.id, { title: restored.title, content: restored.content })
          }}
        />
      )}
    </main>
  )
}
