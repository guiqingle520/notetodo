import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileArchive, FileText, Grid2X2, ShieldCheck, Upload, X } from 'lucide-react'

type ImportInspection = NonNullable<Awaited<ReturnType<NonNullable<typeof window.notetodo>['imports']['pickAndInspect']>>>
type ImportJob = Awaited<ReturnType<NonNullable<typeof window.notetodo>['imports']['listJobs']>>[number]
export { ArchivePanel, CommentsPanel, NotificationPanel, SharePanel } from './AppCollaborationPanels'
export { PageHistoryPanel } from './AppHistoryPanel'
export { ModelSettingsPanel } from './AppSettingsPanel'

export function ImportPanel({ onClose, onImported }: { onClose: () => void; onImported: () => Promise<void> }) {
  const [inspection, setInspection] = useState<ImportInspection | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'importing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ phase: 'convert', completed: 0, total: 1, path: '' })
  const [result, setResult] = useState<{ pageCount: number; databaseCount: number; importedAssets: number; skippedAssets: number; unresolvedLinks: number } | null>(null)
  const [recentJobs, setRecentJobs] = useState<ImportJob[]>([])
  const cancelImportRef = useRef<null | (() => void)>(null)

  useEffect(() => {
    if (window.notetodo?.imports) void window.notetodo.imports.listJobs().then(setRecentJobs).catch(() => {})
  }, [])

  const pickArchive = async () => {
    if (!window.notetodo?.imports) {
      setError('导入功能需要在 NoteTodo 桌面应用中使用。')
      setStatus('error')
      return
    }
    setStatus('loading')
    setError('')
    try {
      const result = await window.notetodo.imports.pickAndInspect()
      if (!result) { setStatus(inspection ? 'ready' : 'idle'); return }
      setInspection(result)
      setStatus('ready')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取这个导出档案。')
      setStatus('error')
    }
  }

  const startImport = async () => {
    if (!inspection || inspection.rejected || !window.notetodo?.imports) return
    setStatus('importing')
    setProgress({ phase: 'convert', completed: 0, total: Math.max(1, inspection.summary.page + inspection.summary.database), path: '' })
    const task = window.notetodo.imports.start(inspection.importId, (next) => setProgress({ ...next, path: next.path ?? '' }))
    cancelImportRef.current = task.cancel
    try {
      const completed = await task.promise
      setResult(completed)
      setStatus('done')
      await onImported()
      setRecentJobs(await window.notetodo.imports.listJobs())
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message.includes('IMPORT_CANCELLED') ? '导入已取消，工作区没有发生部分写入。' : message)
      setStatus('error')
    } finally {
      cancelImportRef.current = null
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }

  return (
    <div className="modal-backdrop import-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="import-panel" role="dialog" aria-modal="true" aria-label="导入工作区" aria-busy={status === 'loading' || status === 'importing'} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><FileArchive size={19} /><span><strong>导入工作区</strong><small>Notion 导出包 · 本地安全预检</small></span></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭导入工作区"><X size={16} /></button>
        </header>

        {!inspection && status !== 'error' && (
          <div className="import-landing">
            <div className="import-seal"><FileArchive size={28} /><span>ZIP</span></div>
            <p className="import-kicker">导入 Notion 内容</p>
            <h2>先检查，再导入</h2>
            <p>选择 Notion 导出的 ZIP。NoteTodo 只读取目录元数据完成安全预检，此阶段不会解压或改动当前工作区。</p>
            <button className="import-primary" onClick={() => void pickArchive()} disabled={status === 'loading'}>
              <Upload size={15} />{status === 'loading' ? '正在读取目录…' : '选择 Notion 导出包'}
            </button>
            <div className="import-footnote"><ShieldCheck size={13} />路径逃逸、重复文件和解压体积会在写入前被拦截</div>
            {recentJobs.length > 0 && <div className="import-ledger"><header><span>最近迁移</span><small>本地导入记录</small></header>{recentJobs.slice(0, 3).map((job) => <div key={job.id}><i data-status={job.status} /><span><strong>{job.sourceName}</strong><small>{new Date(job.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {job.status === 'completed' ? `完成 ${job.report.importedPages ?? 0} 页` : job.status === 'cancelled' ? '已取消' : job.status === 'failed' ? '已回滚' : '处理中'}</small></span><em>{job.status === 'completed' ? '完成' : job.status === 'failed' ? '失败' : job.status === 'cancelled' ? '取消' : '中断'}</em></div>)}</div>}
          </div>
        )}

        {status === 'error' && (
          <div className="import-error" role="alert"><AlertTriangle size={24} /><strong>无法完成预检</strong><p>{error}</p><button onClick={() => void pickArchive()}>重新选择</button></div>
        )}

        {inspection && !['error', 'importing', 'done'].includes(status) && (
          <div className="import-report">
            <div className="import-report-title">
              <span className={inspection.rejected ? 'is-rejected' : 'is-safe'}>{inspection.rejected ? '需要处理' : '安全可导入'}</span>
              <h2>{inspection.fileName}</h2>
              <p>{formatSize(inspection.compressedBytes)} 压缩 · {formatSize(inspection.acceptedBytes)} 展开后</p>
            </div>
            <div className="import-metrics">
              <div><FileText size={15} /><strong>{inspection.summary.page}</strong><span>页面</span></div>
              <div><Grid2X2 size={15} /><strong>{inspection.summary.database}</strong><span>数据库</span></div>
              <div><FileArchive size={15} /><strong>{inspection.summary.asset}</strong><span>附件</span></div>
              <div><LayersIcon /><strong>{inspection.summary.unsupported}</strong><span>跳过</span></div>
            </div>
            {inspection.issues.length > 0 && <div className="import-issues">{inspection.issues.slice(0, 4).map((issue, index) => <p key={`${issue.code}-${index}`}><AlertTriangle size={13} /><span><strong>{issue.code}</strong>{issue.path ? ` · ${issue.path}` : ''}<small>{issue.message}</small></span></p>)}</div>}
            <div className="import-file-sample">
              <header><span>档案清单</span><small>显示前 {Math.min(inspection.entries.length, 6)} / {inspection.entries.length} 项</small></header>
              {inspection.entries.slice(0, 6).map((entry) => <div key={entry.path}><span data-kind={entry.kind}>{entry.kind.slice(0, 1).toUpperCase()}</span><p>{entry.path}</p><small>{formatSize(entry.size)}</small></div>)}
            </div>
            <footer><button className="import-secondary" onClick={() => void pickArchive()}>更换档案</button><span>{inspection.rejected ? '修复导出包中的问题后才能继续' : '页面将在一次事务中写入，失败时自动回滚'}</span>{!inspection.rejected && <button className="import-primary" onClick={() => void startImport()}>开始导入</button>}</footer>
          </div>
        )}
        {inspection && status === 'importing' && (
          <div className="import-running">
            <div className="import-orbit"><FileArchive size={25} /><i /></div>
            <p>{progress.phase === 'commit' ? '正在提交事务' : '正在转换内容'}</p>
            <h2>{progress.phase === 'commit' ? '即将完成。' : `${progress.completed} / ${progress.total}`}</h2>
            <div
              className="import-progress"
              role="progressbar"
              aria-label={progress.phase === 'commit' ? '正在提交导入内容' : '正在转换导入内容'}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.phase === 'commit' ? progress.total : progress.completed}
            ><span style={{ width: `${progress.phase === 'commit' ? 96 : Math.min(92, progress.completed / Math.max(1, progress.total) * 92)}%` }} /></div>
            <small>{progress.path || '正在准备安全读取…'}</small>
            <button className="import-secondary" onClick={() => cancelImportRef.current?.()}>取消导入</button>
          </div>
        )}
        {status === 'done' && result && (
          <div className="import-complete" role="status"><CheckCircle2 size={32} /><p>导入完成</p><h2>内容已添加到工作区</h2><div><span><strong>{result.pageCount}</strong>页面</span><span><strong>{result.databaseCount}</strong>数据库</span><span><strong>{result.importedAssets}</strong>附件</span></div>{(result.skippedAssets > 0 || result.unresolvedLinks > 0) && <small>{result.skippedAssets} 个附件跳过 · {result.unresolvedLinks} 个链接待检查</small>}<button className="import-primary" onClick={onClose}>完成</button></div>
        )}
      </section>
    </div>
  )
}

function LayersIcon() { return <span className="layers-icon" aria-hidden="true">×</span> }
