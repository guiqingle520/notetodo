import { useEffect, useMemo, useRef, useState } from 'react'
import { Command, Menu, PanelRightOpen, Sparkles } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { useWorkspace } from './store'
import { ArchivePanel, ImportPanel, ModelSettingsPanel, NotificationPanel } from './AppPanels'
import { AIPanel, type AIPatchProposal, type SelectionContext } from './AppAIPanel'
import { Sidebar } from './AppSidebar'
import { WorkspaceEditor } from './WorkspaceEditor'
import { WorkspaceHome } from './WorkspaceHome'
import { WorkspacePageList } from './WorkspacePageList'
import { WorkspaceSearchPalette } from './WorkspaceSearchPalette'
import { HelpPanel } from './AppHelpPanel'
import { useCompactShell } from './use-compact-shell'

type AppSurface = 'home' | 'pages' | 'editor'

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [aiOpen, setAiOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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
  useCompactShell(setSidebarCollapsed, setAiOpen)
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
        setHelpOpen(false)
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
          onAI={() => {
            setSurface('editor')
            setAiOpen(true)
          }}
          onHelp={() => setHelpOpen(true)}
          notificationCount={notificationCount}
          activeSurface={surface}
          onHome={() => setSurface('home')}
          onAllPages={() => setSurface('pages')}
          onPageOpen={() => setSurface('editor')}
        />
        {sidebarCollapsed && (
          <button
            className="floating-menu"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="展开侧栏"
          >
            <Menu size={17} />
          </button>
        )}
        {surface === 'home' && <WorkspaceHome onOpenPage={openPage} onCreatePage={createPage} />}
        {surface === 'pages' && (
          <WorkspacePageList onOpenPage={openPage} onCreatePage={() => createPage('blank')} />
        )}
        {surface === 'editor' && (
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
            <button className="open-ai" onClick={() => setAiOpen(true)} aria-label="打开 AI 助手">
              <PanelRightOpen size={17} />
              <Sparkles size={14} />
            </button>
          ))}
        {searchOpen && (
          <WorkspaceSearchPalette onClose={() => setSearchOpen(false)} onOpenPage={openPage} />
        )}
        {archiveOpen && <ArchivePanel onClose={() => setArchiveOpen(false)} />}
        {settingsOpen && <ModelSettingsPanel onClose={() => setSettingsOpen(false)} />}
        {notificationsOpen && (
          <NotificationPanel
            onClose={() => setNotificationsOpen(false)}
            onCountChange={setNotificationCount}
          />
        )}
        {importOpen && <ImportPanel onClose={() => setImportOpen(false)} onImported={hydrate} />}
        {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      </div>
    </div>
  )
}
