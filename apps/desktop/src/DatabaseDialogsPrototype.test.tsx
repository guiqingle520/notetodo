import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseSchema } from '@notetodo/database-core'
import { CsvImportPanel, SchemaPanel, TemplateEditorPanel, ViewRulesPanel } from './DatabaseBlock'
import { AutomationPanel } from './DatabaseSpecialViews'

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
    expect(screen.getByRole('textbox', { name: '新属性名称' })).toHaveFocus()
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
    expect(screen.getByRole('tab', { name: '筛选 0' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '排序 0' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: '分组' })).toBeInTheDocument()
  })

  it('exposes automation navigation and dismissal to keyboard users', () => {
    const onClose = vi.fn()
    render(
      <AutomationPanel
        schema={schema}
        rules={[]}
        runs={[]}
        onClose={onClose}
        onSave={vi.fn()}
        onToggle={vi.fn()}
        onReplay={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: '数据库自动化' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭数据库自动化' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: '规则 0' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '运行 0' })).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(screen.getByRole('button', { name: '关闭数据库自动化' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps template and CSV authoring dialogs labelled and dismissible', () => {
    const closeTemplate = vi.fn()
    const template = render(
      <TemplateEditorPanel
        schema={schema}
        template={null}
        onClose={closeTemplate}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog', { name: '编辑数据库模板' })).toBeInTheDocument()
    expect(screen.getByText('新建模板')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '模板名称' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeTemplate).toHaveBeenCalledOnce()
    template.unmount()

    const closeCsv = vi.fn()
    render(<CsvImportPanel schema={schema} onClose={closeCsv} onImport={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '导入 CSV' })).toBeInTheDocument()
    expect(screen.getByLabelText('选择 CSV 文件')).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeCsv).toHaveBeenCalledOnce()
  })
})
