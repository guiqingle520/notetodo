import { useEffect, useState } from 'react'
import { Database, Plus } from 'lucide-react'
import type { DatabaseSnapshot } from '@notetodo/database-core'
import { DatabaseBlock } from './DatabaseBlock'
import { databaseRepository } from './data/database-repository'

/** Loads the page database independently so document rendering is never blocked by SQLite I/O. */
export function PageDatabaseMount({
  pageId,
  pageTitle,
  canEdit,
  fullPage = false,
}: {
  pageId: string
  pageTitle: string
  canEdit: boolean
  fullPage?: boolean
}) {
  const [snapshot, setSnapshot] = useState<DatabaseSnapshot | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    setSnapshot(undefined)
    void databaseRepository.loadByPage(pageId).then((loaded) => {
      if (active) setSnapshot(loaded)
    })
    return () => {
      active = false
    }
  }, [pageId])
  if (snapshot === undefined) return null
  if (snapshot)
    return (
      <div className={fullPage ? 'database-page-surface' : undefined}>
        <DatabaseBlock pageId={pageId} initialSnapshot={snapshot} />
      </div>
    )
  return canEdit ? (
    <div className={fullPage ? 'database-page-surface is-empty' : undefined}>
      <DatabaseCreationPrompt
        pageTitle={pageTitle}
        fullPage={fullPage}
        onCreate={async (name) => setSnapshot(await databaseRepository.createOnPage(pageId, name))}
      />
    </div>
  ) : null
}

export function DatabaseCreationPrompt({
  pageTitle,
  onCreate,
  fullPage = false,
}: {
  pageTitle: string
  onCreate: (name: string) => Promise<void>
  fullPage?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(`${pageTitle || '未命名'} 数据库`)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    const normalized = name.trim()
    if (!normalized || busy) return
    setBusy(true)
    try {
      await onCreate(normalized)
    } finally {
      setBusy(false)
    }
  }
  if (!open && !fullPage)
    return (
      <button className="database-create-trigger" onClick={() => setOpen(true)}>
        <Database size={14} />
        <span>
          <strong>创建数据库</strong>
          <small>在当前页面建立结构化集合</small>
        </span>
        <Plus size={13} />
      </button>
    )
  return (
    <section className="database-create-composer">
      <div>
        <Database size={18} />
        <span>
          <strong>{fullPage ? '创建整页数据库' : '创建数据库'}</strong>
          <small>
            {fullPage ? '从表格开始，之后随时切换看板、日历或画廊' : '为此页面添加一个内联数据库'}
          </small>
        </span>
      </div>
      <label>
        <span>数据库名称</span>
        <input
          autoFocus
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void create()
            if (event.key === 'Escape') setOpen(false)
          }}
        />
      </label>
      <p>包含名称、状态和日期属性。创建后可以继续添加属性与视图。</p>
      <footer>
        {!fullPage && <button onClick={() => setOpen(false)}>取消</button>}
        <button disabled={!name.trim() || busy} onClick={() => void create()}>
          {busy ? '正在创建…' : '创建数据库'}
        </button>
      </footer>
    </section>
  )
}
