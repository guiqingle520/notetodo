import { useEffect, useMemo, useRef, useState } from 'react'
import { Command, Menu, PanelRightOpen, Sparkles } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { useWorkspace } from './store'
import {
  ArchivePanel,
  ImportPanel,
  ModelSettingsPanel,
  NotificationPanel,
  SearchPalette,
} from './AppPanels'
import { AIPanel, type AIPatchProposal, type SelectionContext } from './AppAIPanel'
import { Sidebar } from './AppSidebar'
import { WorkspaceEditor } from './WorkspaceEditor'
import { WorkspaceHome } from './WorkspaceHome'

type AppSurface = 'home' | 'editor'

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [aiOpen, setAiOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const [surface, setSurface] = useState<AppSurface>('home')
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null)
  const hydrate = useWorkspace((state) => state.hydrate)
  const setActivePage = useWorkspace((state) => state.setActivePage)
  const addPage = useWorkspace((state) => state.addPage)
  const activeEditorRef = useRef<Editor | null>(null)
  const setActiveEditor = useMemo(
    () => (editor: Editor | null) => {
      activeEditorRef.current = editor
    },
    [],
  )

  const openPage = (pageId: string) => {
    setActivePage(pageId)
    setSurface('editor')
  }

  const createPage = (templateId: Parameters<typeof addPage>[1]) => {
    addPage(null, templateId)
    setSurface('editor')
  }

  const applyAIPatch = (patch: AIPatchProposal) => {
    const editor = activeEditorRef.current
    if (!editor) return false
    const paragraphs = patch.text
      .split(/\n{2,}/u)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({ type: 'paragraph', content: [{ type: 'text', text: value }] }))
    if (!paragraphs.length) return false
    return patch.operation === 'replace-selection' && patch.range
      ? editor.chain().focus().insertContentAt(patch.range, paragraphs).run()
      : editor.chain().focus().insertContent(paragraphs).run()
  }

  useEffect(() => {
    void hydrate()
  }, [hydrate])
  useEffect(() => {
    if (window.notetodo?.notifications)
      void window.notetodo.notifications
        .list()
        .then((items) => setNotificationCount(items.filter((item) => !item.readAt).length))
  }, [])

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setArchiveOpen(false)
        setSettingsOpen(false)
        setNotificationsOpen(false)
        setImportOpen(false)
      }
    }
    window.addEventListener('keydown', handleGlobalShortcut)
    return () => window.removeEventListener('keydown', handleGlobalShortcut)
  }, [])

  return (
    <div className="app-shell">
      <div className="title-drag-region">
        <div className="drag-title">
          <Command size={13} />
          NoteTodo
        </div>
      </div>
      <div className="app-body">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          onSearch={() => setSearchOpen(true)}
          onArchive={() => setArchiveOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onNotifications={() => setNotificationsOpen(true)}
          onImport={() => setImportOpen(true)}
          notificationCount={notificationCount}
          activeSurface={surface}
          onHome={() => setSurface('home')}
          onPageOpen={() => setSurface('editor')}
        />
        {sidebarCollapsed && (
          <button className="floating-menu" onClick={() => setSidebarCollapsed(false)}>
            <Menu size={17} />
          </button>
        )}
        {surface === 'home' ? (
          <WorkspaceHome onOpenPage={openPage} onCreatePage={createPage} />
        ) : (
          <WorkspaceEditor
            onEditorReady={setActiveEditor}
            onSelectionChange={setSelectionContext}
          />
        )}
        {surface === 'editor' &&
          (aiOpen ? (
            <AIPanel
              onClose={() => setAiOpen(false)}
              selectionContext={selectionContext}
              onApplyPatch={applyAIPatch}
              onUndoPatch={() => activeEditorRef.current?.commands.undo()}
            />
          ) : (
            <button className="open-ai" onClick={() => setAiOpen(true)}>
              <PanelRightOpen size={17} />
              <Sparkles size={14} />
            </button>
          ))}
        {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
        {archiveOpen && <ArchivePanel onClose={() => setArchiveOpen(false)} />}
        {settingsOpen && <ModelSettingsPanel onClose={() => setSettingsOpen(false)} />}
        {notificationsOpen && (
          <NotificationPanel
            onClose={() => setNotificationsOpen(false)}
            onCountChange={setNotificationCount}
          />
        )}
        {importOpen && <ImportPanel onClose={() => setImportOpen(false)} onImported={hydrate} />}
      </div>
    </div>
  )
}
