import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import seedWorkspace from '../shared/seed-workspace.json'
import type { WorkspaceSnapshot } from './domain'
import { AIPanel } from './AppAIPanel'
import { useWorkspace } from './store'

beforeEach(() => {
  useWorkspace.setState({
    ...(structuredClone(seedWorkspace) as WorkspaceSnapshot),
    hydrated: true,
    searchResults: [],
  })
})

afterEach(cleanup)

describe('AIPanel', () => {
  it('renders the prototype context, quick actions and accessible composer', () => {
    render(
      <AIPanel
        id="ai-panel"
        onClose={vi.fn()}
        selectionContext={null}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
      />,
    )

    expect(screen.getByRole('complementary', { name: '工作副驾驶' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '工作副驾驶' })).toHaveAttribute(
      'id',
      'ai-panel',
    )
    expect(screen.getByRole('log', { name: 'AI 对话' })).toBeInTheDocument()
    expect(screen.getByRole('log', { name: 'AI 对话' })).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByText(/当前页面 · \d+ 块/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /当前页面/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '生成摘要' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '向工作副驾驶提问' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择 AI 上下文' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()
  })

  it('selects available context from the composer menu and closes with Escape', () => {
    render(
      <AIPanel
        onClose={vi.fn()}
        selectionContext={{ from: 0, to: 4, text: '测试选区' }}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
      />,
    )

    const menuTrigger = screen.getByRole('button', { name: '选择 AI 上下文' })
    fireEvent.click(menuTrigger)
    expect(screen.getByRole('menu', { name: '选择 AI 上下文' })).toHaveAttribute(
      'id',
      menuTrigger.getAttribute('aria-controls'),
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: /所选文本/u }))
    expect(screen.getByText('所选文本上下文已开启')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '选择 AI 上下文' }))
    expect(screen.getByRole('menu', { name: '选择 AI 上下文' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '选择 AI 上下文' })).not.toBeInTheDocument()
    expect(menuTrigger).toHaveFocus()
  })

  it('opens and navigates the context menu from the keyboard', () => {
    render(
      <AIPanel
        onClose={vi.fn()}
        selectionContext={{ from: 0, to: 4, text: '测试选区' }}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
      />,
    )
    const trigger = screen.getByRole('button', { name: '选择 AI 上下文' })

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const items = screen.getAllByRole('menuitemradio')
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
  })

  it('explains why selected text is unavailable', () => {
    render(
      <AIPanel
        onClose={vi.fn()}
        selectionContext={null}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '选择 AI 上下文' }))
    expect(screen.getByRole('menuitemradio', { name: /请先在页面中选择文字/u })).toBeDisabled()
  })

  it('exposes the selected-text context as a pressed state', () => {
    render(
      <AIPanel
        onClose={vi.fn()}
        selectionContext={{ from: 0, to: 4, text: '测试选区' }}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
      />,
    )

    const pageButton = screen.getByRole('button', { name: /当前页面/u })
    const selectionButton = screen.getByRole('button', { name: '所选文本' })

    fireEvent.click(selectionButton)

    expect(pageButton).toHaveAttribute('aria-pressed', 'false')
    expect(selectionButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('“测试选区”')).toBeInTheDocument()
  })

  it('closes from the labelled header control', () => {
    const onClose = vi.fn()
    render(
      <AIPanel
        onClose={onClose}
        selectionContext={null}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '收起工作副驾驶' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
