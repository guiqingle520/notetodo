import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelSettingsPanel } from './AppPanels'

afterEach(cleanup)

describe('settings prototype surface', () => {
  it('exposes labelled settings navigation and an explicit close action', () => {
    const onClose = vi.fn()
    render(<ModelSettingsPanel id="settings-dialog" onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: '模型与 AI 设置' })).toHaveAttribute(
      'id',
      'settings-dialog',
    )
    expect(screen.getByRole('navigation', { name: '设置分类' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '模型与 AI' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    fireEvent.click(screen.getByRole('button', { name: 'API 访问' }))
    expect(screen.getByRole('button', { name: 'API 访问' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '模型与 AI' })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: '关闭设置' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps model fields and integration actions discoverable', () => {
    render(<ModelSettingsPanel onClose={vi.fn()} />)

    expect(screen.getByRole('combobox', { name: '供应商协议' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '模型名称' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '令牌名称' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Webhook 地址' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '签发令牌' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '添加端点' })).toBeDisabled()
  })

  it('scrolls the selected settings section into view', () => {
    render(<ModelSettingsPanel onClose={vi.fn()} />)
    const target = document.getElementById('settings-tokens')
    const scrollIntoView = vi.fn()
    if (target) target.scrollIntoView = scrollIntoView

    fireEvent.click(screen.getByRole('button', { name: 'API 访问' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
  })

  it('moves through settings categories with vertical navigation keys', () => {
    render(<ModelSettingsPanel onClose={vi.fn()} />)
    const model = screen.getByRole('button', { name: '模型与 AI' })
    const tokens = screen.getByRole('button', { name: 'API 访问' })
    const webhooks = screen.getByRole('button', { name: 'Webhook' })

    expect(model).toHaveAttribute('tabindex', '0')
    expect(tokens).toHaveAttribute('tabindex', '-1')
    expect(model).toHaveAttribute('aria-controls', 'settings-model')
    expect(document.getElementById('settings-model')).toHaveAttribute('aria-labelledby', model.id)

    fireEvent.keyDown(model, { key: 'ArrowDown' })
    expect(tokens).toHaveFocus()
    expect(tokens).toHaveAttribute('aria-current', 'page')
    fireEvent.keyDown(tokens, { key: 'End' })
    expect(webhooks).toHaveFocus()
    fireEvent.keyDown(webhooks, { key: 'ArrowDown' })
    expect(model).toHaveFocus()
  })
})
