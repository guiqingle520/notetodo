import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseSchema } from '@notetodo/database-core'
import { SchemaPanel, ViewRulesPanel } from './DatabaseBlock'

const schema: DatabaseSchema = {
  id: 'product-db',
  name: '产品路线',
  properties: [
    { id: 'title', name: '任务', type: 'title' },
    { id: 'status', name: '状态', type: 'select', options: [] },
  ],
}

describe('database prototype dialogs', () => {
  it('uses direct Notion-style naming for property management', () => {
    const onClose = vi.fn()
    render(
      <SchemaPanel
        schema={schema}
        databaseSources={[]}
        relationTargets={{}}
        onClose={onClose}
        onAdd={vi.fn()}
        onRename={vi.fn()}
        onReorder={vi.fn()}
        onConfigure={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: '数据库属性管理' })).toBeInTheDocument()
    expect(screen.getByText('属性')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭属性管理' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('groups filters, sorts and grouping in one labelled workspace', () => {
    render(
      <ViewRulesPanel
        schema={schema}
        config={{}}
        initialTab="filters"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: '视图规则工作台' })).toBeInTheDocument()
    expect(screen.getByText('筛选、排序与分组')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '筛选 0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '排序 0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分组' })).toBeInTheDocument()
  })
})
