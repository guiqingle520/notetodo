import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileText,
  MousePointer2,
  PanelRightClose,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { useWorkspace } from './store'

export type SelectionContext = { from: number; to: number; text: string }
export type AIPatchProposal = {
  text: string
  operation: 'insert-paragraphs' | 'replace-selection'
  range?: { from: number; to: number }
}
type RetrievalCitation = Awaited<
  ReturnType<NonNullable<typeof window.notetodo>['retrieval']['search']>
>[number]

export function AIPanel({
  onClose,
  selectionContext,
  onApplyPatch,
  onUndoPatch,
}: {
  onClose: () => void
  selectionContext: SelectionContext | null
  onApplyPatch: (patch: AIPatchProposal) => boolean
  onUndoPatch: () => void
}) {
  const { pages, activePageId, setActivePage } = useWorkspace()
  const activePage = pages.find((page) => page.id === activePageId)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string; citations?: RetrievalCitation[] }>
  >([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const cancelRef = useRef<null | (() => void)>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [modelName, setModelName] = useState('浏览器预览模型')
  const [contextMode, setContextMode] = useState<'page' | 'selection'>('page')
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [patch, setPatch] = useState<null | {
    id: string
    text: string
    operation: AIPatchProposal['operation']
    range?: { from: number; to: number }
    status: 'proposed' | 'applied'
  }>(null)
  const pageContext = useMemo(() => {
    if (!activePage) return { text: '', blocks: 0 }
    const document = new DOMParser().parseFromString(activePage.content, 'text/html')
    const blocks = document.body.querySelectorAll('p,h1,h2,h3,li,blockquote,pre').length
    return {
      text: (document.body.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 40_000),
      blocks,
    }
  }, [activePage])
  const usingSelection = contextMode === 'selection' && selectionContext

  useEffect(() => {
    if (window.notetodo?.model)
      void window.notetodo.model.getConfig().then((config) => setModelName(config.model))
  }, [])

  useEffect(() => {
    if (!contextMenuOpen) return

    // Keep the compact composer menu consistent with the rest of the desktop
    // shell: Escape and a pointer press outside both dismiss it without
    // changing the active context.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenuOpen(false)
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('pointerdown', closeOnOutsidePress)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('pointerdown', closeOnOutsidePress)
    }
  }, [contextMenuOpen])

  const submit = async () => {
    const content = prompt.trim()
    if (!content || running) return
    const history = [...messages, { role: 'user' as const, content }]
    setPrompt('')
    setError('')
    setRunning(true)
    const citations =
      !usingSelection && window.notetodo?.retrieval
        ? await window.notetodo.retrieval.search(content, 6).catch(() => [] as RetrievalCitation[])
        : []
    setMessages([...history, { role: 'assistant', content: '', citations }])

    const onEvent = (event: { type: string; text?: string; message?: string }) => {
      if (event.type === 'text-delta' && event.text) {
        setMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1
              ? { ...message, content: message.content + event.text }
              : message,
          ),
        )
      }
      if (event.type === 'error') {
        setError(event.message ?? '模型执行失败。')
        setRunning(false)
      }
      if (event.type === 'done' || event.type === 'cancelled') setRunning(false)
    }

    if (window.notetodo?.model) {
      cancelRef.current = window.notetodo.model.streamChat(
        {
          messages: [
            {
              role: 'system',
              content: '你是 NoteTodo 工作副驾驶。回答简洁、准确；涉及写入时先说明将要修改的内容。',
            },
            ...(activePage
              ? [
                  {
                    role: 'system' as const,
                    content: usingSelection
                      ? `当前页面标题：${activePage.title}\n用户明确选择的正文：${selectionContext.text}`
                      : `当前页面标题：${activePage.title}\n当前页面正文：${pageContext.text || '（空页面）'}`,
                  },
                ]
              : []),
            ...(citations.length
              ? [
                  {
                    role: 'system' as const,
                    content: `以下是经过页面权限过滤的工作区检索片段。仅依据相关内容回答，并用 [S1] 形式标注引用：\n${citations.map((citation) => `[${citation.citationId}] ${citation.title} / ${citation.heading}\n${citation.excerpt}`).join('\n\n')}`,
                  },
                ]
              : []),
            ...history.map(({ role, content: messageContent }) => ({
              role,
              content: messageContent,
            })),
          ],
        },
        onEvent,
      )
    } else {
      // Browser preview uses a deterministic stream so interaction and layout
      // can be tested without sending data to an external model.
      const demo = '这是浏览器预览响应。桌面应用会使用你在设置中配置的模型，并以流式方式返回结果。'
      let index = 0
      const timer = window.setInterval(() => {
        onEvent({ type: 'text-delta', text: demo[index] })
        index += 1
        if (index >= demo.length) {
          window.clearInterval(timer)
          onEvent({ type: 'done' })
        }
      }, 24)
      cancelRef.current = () => {
        window.clearInterval(timer)
        onEvent({ type: 'cancelled' })
      }
    }
  }

  const cancel = () => {
    cancelRef.current?.()
    cancelRef.current = null
    setRunning(false)
  }

  useEffect(() => () => cancelRef.current?.(), [])

  const proposePatch = async (text: string) => {
    const operation: AIPatchProposal['operation'] = usingSelection
      ? 'replace-selection'
      : 'insert-paragraphs'
    const id =
      window.notetodo?.ai && activePage
        ? await window.notetodo.ai.createPatchAudit(activePage.id, operation, text)
        : crypto.randomUUID()
    setPatch({
      id,
      text,
      operation,
      ...(usingSelection
        ? { range: { from: selectionContext.from, to: selectionContext.to } }
        : {}),
      status: 'proposed',
    })
  }

  const rejectPatch = () => {
    if (patch && window.notetodo?.ai) void window.notetodo.ai.updatePatchAudit(patch.id, 'rejected')
    setPatch(null)
  }

  const applyPatch = () => {
    if (
      !patch ||
      !onApplyPatch({ text: patch.text, operation: patch.operation, range: patch.range })
    )
      return
    if (window.notetodo?.ai) void window.notetodo.ai.updatePatchAudit(patch.id, 'applied')
    setPatch({ ...patch, status: 'applied' })
  }

  const undoPatch = () => {
    if (!patch) return
    onUndoPatch()
    if (window.notetodo?.ai) void window.notetodo.ai.updatePatchAudit(patch.id, 'undone')
    setPatch(null)
  }

  return (
    <aside className="ai-panel" aria-label="工作副驾驶">
      <div className="ai-panel-head">
        <div>
          <span className="ai-orbit">
            <Sparkles size={15} />
          </span>
          <strong>工作副驾驶</strong>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="收起工作副驾驶">
          <PanelRightClose size={17} />
        </button>
      </div>
      <div className="ai-context">
        <span>上下文</span>
        <div className="context-switch" role="group" aria-label="AI 上下文范围">
          <button
            className={contextMode === 'page' ? 'is-active' : ''}
            aria-pressed={contextMode === 'page'}
            onClick={() => setContextMode('page')}
          >
            当前页面 · {pageContext.blocks} 块
          </button>
          <button
            className={contextMode === 'selection' ? 'is-active' : ''}
            aria-pressed={contextMode === 'selection'}
            disabled={!selectionContext}
            onClick={() => setContextMode('selection')}
          >
            所选文本
          </button>
        </div>
        <strong>
          {usingSelection
            ? `“${selectionContext.text.slice(0, 36)}${selectionContext.text.length > 36 ? '…' : ''}”`
            : (activePage?.title ?? '当前页面')}
        </strong>
      </div>
      <div className="ai-conversation" role="log" aria-live="polite" aria-label="AI 对话">
        {!messages.length && (
          <div className="ai-message">
            <span className="ai-orbit">
              <Sparkles size={14} />
            </span>
            <div>
              <p>我可以帮你整理这页内容，也可以调用已经授权的工具。</p>
              <div className="quick-actions">
                <button onClick={() => setPrompt('提取当前页面的待办事项')}>提取待办</button>
                <button onClick={() => setPrompt('总结当前页面')}>生成摘要</button>
                <button onClick={() => setPrompt('根据当前内容继续写')}>继续写</button>
              </div>
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div className={`chat-message is-${message.role}`} key={index}>
            {message.role === 'assistant' && (
              <span className="ai-orbit">
                <Sparkles size={13} />
              </span>
            )}
            <div>
              <small>{message.role === 'user' ? '你' : 'NoteTodo AI'}</small>
              <p>
                {message.content || (running && index === messages.length - 1 ? '正在思考…' : '')}
              </p>
              {message.role === 'assistant' &&
                message.content &&
                !running &&
                index === messages.length - 1 && (
                  <>
                    <button
                      className="preview-patch"
                      onClick={() => void proposePatch(message.content)}
                    >
                      <FileText size={12} />
                      预览写入
                    </button>
                    <div className="ai-citation">
                      <BookOpen size={11} />
                      <span>来源</span>
                      {message.citations?.length ? (
                        message.citations.map((citation) => (
                          <button
                            key={`${citation.pageId}-${citation.chunkIndex}`}
                            onClick={() => setActivePage(citation.pageId)}
                          >
                            <em>{citation.citationId}</em>
                            {citation.title}
                          </button>
                        ))
                      ) : (
                        <button onClick={() => activePage && setActivePage(activePage.id)}>
                          {activePage?.title}
                          {usingSelection ? ' / 所选文本' : ' / 当前页面'}
                        </button>
                      )}
                    </div>
                  </>
                )}
            </div>
          </div>
        ))}
        {error && (
          <div className="ai-error">
            <CircleHelp size={14} />
            {error}
          </div>
        )}
        {patch && (
          <section className={`ai-patch-card is-${patch.status}`}>
            <header>
              <span>AI 变更 / {patch.operation === 'replace-selection' ? '替换' : '插入'}</span>
              <strong>{patch.status === 'applied' ? '已写入页面' : '待确认变更'}</strong>
            </header>
            <div className="patch-target">
              <FileText size={13} />
              <span>
                <small>目标</small>
                {activePage?.title ?? '当前页面'} ·{' '}
                {patch.operation === 'replace-selection' ? '替换所选文本' : '光标后插入'}
              </span>
            </div>
            {patch.operation === 'replace-selection' && selectionContext && (
              <del>{selectionContext.text}</del>
            )}
            <pre>{patch.text}</pre>
            <footer>
              {patch.status === 'proposed' ? (
                <>
                  <button onClick={rejectPatch}>取消</button>
                  <button className="apply-patch" onClick={applyPatch}>
                    确认写入
                  </button>
                </>
              ) : (
                <>
                  <span>
                    <CheckCircle2 size={13} />
                    已记录到审计日志
                  </span>
                  <button onClick={undoPatch}>撤销</button>
                </>
              )}
            </footer>
          </section>
        )}
      </div>
      <div className="model-pill" role="status">
        <span className="status-dot" />
        当前模型 · {modelName}
      </div>
      <form
        className="ai-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <textarea
          aria-label="向工作副驾驶提问"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="询问、改写，或交给 AI 执行…"
        />
        <div>
          <div className="ai-context-picker" ref={contextMenuRef}>
            <button
              type="button"
              aria-label="选择 AI 上下文"
              aria-haspopup="menu"
              aria-expanded={contextMenuOpen}
              onClick={() => setContextMenuOpen((current) => !current)}
            >
              <Plus size={16} />
            </button>
            {contextMenuOpen && (
              <div className="ai-context-menu" role="menu" aria-label="选择 AI 上下文">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={contextMode === 'page'}
                  onClick={() => {
                    setContextMode('page')
                    setContextMenuOpen(false)
                  }}
                >
                  <FileText size={15} />
                  <span>
                    <strong>当前页面</strong>
                    <small>{pageContext.blocks} 个内容块</small>
                  </span>
                  {contextMode === 'page' && <CheckCircle2 size={14} />}
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={contextMode === 'selection'}
                  disabled={!selectionContext}
                  onClick={() => {
                    setContextMode('selection')
                    setContextMenuOpen(false)
                  }}
                >
                  <MousePointer2 size={15} />
                  <span>
                    <strong>所选文本</strong>
                    <small>
                      {selectionContext ? '仅使用编辑器中的选区' : '请先在页面中选择文字'}
                    </small>
                  </span>
                  {contextMode === 'selection' && <CheckCircle2 size={14} />}
                </button>
              </div>
            )}
          </div>
          <span>{usingSelection ? '所选文本上下文已开启' : '页面上下文已开启'}</span>
          {running ? (
            <button
              type="button"
              className="send-button is-cancel"
              onClick={cancel}
              aria-label="停止生成"
            >
              <X size={14} />
            </button>
          ) : (
            <button className="send-button" disabled={!prompt.trim()} aria-label="发送消息">
              <ChevronRight size={17} />
            </button>
          )}
        </div>
      </form>
      <small className="ai-disclaimer">AI 可能犯错。所有写入操作都可以撤销。</small>
    </aside>
  )
}
