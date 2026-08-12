import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelSettingsPanel } from './AppPanels'

afterEach(cleanup)

describe('settings prototype surface', () => {
  it('exposes labelled settings navigation and an explicit close action', () => {
    const onClose = vi.fn()
    render(<ModelSettingsPanel onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: '模型与 AI 设置' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '设置分类' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '模型与 AI' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    fireEvent.click(screen.getByRole('button', { name: '关闭设置' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps model fields and integration actions discoverable', () => {
    render(<ModelSettingsPanel onClose={vi.fn()} />)

    expect(screen.getByRole('combobox', { name: '供应商协议' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '模型名称' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '签发令牌' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '添加端点' })).toBeDisabled()
  })
})
