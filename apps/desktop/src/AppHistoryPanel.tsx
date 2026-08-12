import { Clock3, History, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { diffHistoryHtml, historyTextLines } from './data/page-history'
import type { WorkspacePage } from './domain'

type PageVersionSummary = Awaited<
  ReturnType<NonNullable<typeof window.notetodo>['history']['list']>
>[number]
type PageVersionDetail = NonNullable<
  Awaited<ReturnType<NonNullable<typeof window.notetodo>['history']['get']>>
>

interface PageHistoryPanelProps {
  page: WorkspacePage
  canRestore: boolean
  onRestored: (page: WorkspacePage) => void
  onClose: () => void
}

function errorMessage(reason: unknown, fallback: string) {
  if (!(reason instanceof Error)) return fallback
  return reason.message.split('Error: ').at(-1) ?? reason.message
}

export function PageHistoryPanel({ page, canRestore, onRestored, onClose }: PageHistoryPanelProps) {
  const [versions, setVersions] = useState<PageVersionSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PageVersionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const items = window.notetodo?.history ? await window.notetodo.history.list(page.id) : []
      setVersions(items)
      setSelectedId((current) =>
        current && items.some((item) => item.id === current) ? current : (items[0]?.id ?? null),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setError('')
    void refresh().catch((reason) => setError(errorMessage(reason, '历史记录读取失败。')))
  }, [page.id])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  useEffect(() => {
    let active = true
    setDetail(null)
    setDetailLoading(Boolean(selectedId))
    if (selectedId && window.notetodo?.history) {
      void window.notetodo.history
        .get(page.id, selectedId)
        .then((version) => {
          if (active) setDetail(version)
        })
        .catch((reason) => {
          if (active) setError(errorMessage(reason, '版本内容读取失败。'))
        })
        .finally(() => {
          if (active) setDetailLoading(false)
        })
    } else {
      setDetailLoading(false)
    }
    return () => {
      active = false
    }
  }, [page.id, selectedId])

  const diff = useMemo(
    () => (detail ? diffHistoryHtml(detail.content, page.content) : []),
    [detail, page.content],
  )
  const additions = diff.filter((line) => line.kind === 'added').length
  const removals = diff.filter((line) => line.kind === 'removed').length

  const restore = async () => {
    if (!selectedId || !canRestore || !window.notetodo?.history) return
    setBusy(true)
    setError('')
    try {
      const restored = await window.notetodo.history.restore(page.id, selectedId)
      onRestored(restored)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason, '版本恢复失败。'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop history-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="history-panel"
        role="dialog"
        aria-modal="true"
        aria-label="页面历史"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <History size={17} />
            <span>
              <strong>页面历史</strong>
              <small>{page.title} · 最多保留 200 版</small>
            </span>
          </div>
          <button onClick={onClose} aria-label="关闭页面历史">
            <X size={16} />
          </button>
        </header>
        <div className="history-layout">
          <aside className="history-timeline" aria-label="历史版本">
            <div>
              <span>自动保存</span>
              <small>{versions.length} 版</small>
            </div>
            {versions.map((version, index) => (
              <button
                className={selectedId === version.id ? 'is-selected' : ''}
                aria-pressed={selectedId === version.id}
                key={version.id}
                onClick={() => setSelectedId(version.id)}
              >
                <i>{String(versions.length - index).padStart(2, '0')}</i>
                <span>
                  <strong>{version.reason === 'restore' ? '恢复前快照' : version.title}</strong>
                  <small>{new Date(version.createdAt).toLocaleString('zh-CN')}</small>
                  <em>{historyTextLines(version.preview, 1)[0] ?? '空白页面'}</em>
                </span>
              </button>
            ))}
            {loading && (
              <div className="history-empty" role="status">
                正在加载历史版本…
              </div>
            )}
            {!loading && !versions.length && (
              <div className="history-empty" role="status">
                <Clock3 size={22} />
                <strong>还没有历史版本</strong>
                <span>编辑页面后会自动保存版本。</span>
              </div>
            )}
          </aside>
          <main className="history-proof">
            {detail ? (
              <>
                <div className="history-proof-head">
                  <span>
                    <small>版本 #{detail.id}</small>
                    <strong>{detail.title}</strong>
                  </span>
                  <div>
                    <em className="is-added">+{additions}</em>
                    <em className="is-removed">−{removals}</em>
                  </div>
                </div>
                {detail.title !== page.title && (
                  <div className="history-title-diff">
                    <del>{detail.title}</del>
                    <ins>{page.title}</ins>
                  </div>
                )}
                <div className="history-diff" aria-label="版本文本差异">
                  {diff.map((line, index) => (
                    <div className={`is-${line.kind}`} key={`${index}-${line.text}`}>
                      <i>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : '·'}</i>
                      <span>{line.text}</span>
                    </div>
                  ))}
                  {!diff.length && (
                    <div className="history-no-change">此版本与当前正文没有文本差异。</div>
                  )}
                </div>
                <footer>
                  <span>
                    {canRestore ? '恢复前会保存当前页面，因此可以撤回。' : '当前角色只能查看历史。'}
                  </span>
                  <button
                    title={canRestore ? undefined : '当前角色无恢复权限'}
                    disabled={!canRestore || busy}
                    onClick={() => void restore()}
                  >
                    <RotateCcw size={13} />
                    {busy ? '正在恢复…' : '恢复此版本'}
                  </button>
                </footer>
              </>
            ) : (
              <div className="history-loading" role="status">
                {detailLoading ? '正在加载版本内容…' : '选择左侧版本以查看变化。'}
              </div>
            )}
            {error && (
              <p className="history-error" role="alert">
                {error}
              </p>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}
