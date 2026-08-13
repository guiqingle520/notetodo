import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileText } from 'lucide-react'
import {
  AttachmentProgress,
  BlockToolbar,
  PageMentionMenu,
  SlashCommandMenu,
  type EditorMenuState,
} from './EditorFloatingSurfaces'
import type { WorkspacePage } from './domain'

afterEach(cleanup)

const menuState: EditorMenuState = { from: 1, left: 10, top: 20, query: '', index: 0 }

describe('EditorFloatingSurfaces', () => {
  it('renders progress and dispatches available block actions', () => {
    const onAction = vi.fn()
    render(
      <>
        <AttachmentProgress
          state={{ phase: 'working', percent: 42, name: 'brief.pdf', message: '正在写入' }}
        />
        <BlockToolbar top={12} index={0} childCount={2} onAction={onAction} />
      </>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('正在写入brief.pdf42%')
    expect(screen.getByRole('button', { name: '上移内容块' })).toBeDisabled()
    fireEvent.mouseDown(screen.getByRole('button', { name: '复制内容块' }))
    expect(onAction).toHaveBeenCalledWith('duplicate')
  })

  it('dispatches block actions from keyboard-generated clicks without duplicating pointer clicks', () => {
    const onAction = vi.fn()
    render(<BlockToolbar top={12} index={1} childCount={3} onAction={onAction} />)

    const moveDown = screen.getByRole('button', { name: '下移内容块' })
    fireEvent.click(moveDown, { detail: 0 })
    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenLastCalledWith('move-down')

    fireEvent.mouseDown(moveDown)
    fireEvent.click(moveDown, { detail: 1 })
    expect(onAction).toHaveBeenCalledTimes(2)
  })

  it('renders slash commands and preserves pointer selection', () => {
    const onSelect = vi.fn()
    const command = {
      label: '文本',
      hint: '插入普通文本',
      keywords: 'text',
      icon: FileText,
      run: vi.fn(),
    }
    render(<SlashCommandMenu state={menuState} commands={[command]} onSelect={onSelect} onHighlight={vi.fn()} />)

    fireEvent.mouseDown(screen.getByRole('menuitem', { name: /文本/u }))
    expect(onSelect).toHaveBeenCalledWith(command)
  })

  it('activates a focused menu item from the keyboard without duplicating pointer selection', () => {
    const onSelect = vi.fn()
    const command = {
      label: '文本',
      hint: '插入普通文本',
      keywords: 'text',
      icon: FileText,
      run: vi.fn(),
    }
    render(
      <SlashCommandMenu
        state={menuState}
        commands={[command]}
        onSelect={onSelect}
        onHighlight={vi.fn()}
      />,
    )

    const item = screen.getByRole('menuitem', { name: /文本/u })
    fireEvent.click(item, { detail: 0 })
    expect(onSelect).toHaveBeenCalledOnce()

    fireEvent.mouseDown(item)
    fireEvent.click(item, { detail: 1 })
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('keeps the keyboard-selected command visible while navigating a long menu', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    const commands = ['文本', '标题', '待办'].map((label) => ({
      label,
      hint: `插入${label}`,
      keywords: label,
      icon: FileText,
      run: vi.fn(),
    }))

    const { rerender } = render(
      <SlashCommandMenu state={menuState} commands={commands} onSelect={vi.fn()} onHighlight={vi.fn()} />,
    )
    scrollIntoView.mockClear()
    rerender(
      <SlashCommandMenu
        state={{ ...menuState, index: 2 }}
        commands={commands}
        onSelect={vi.fn()}
        onHighlight={vi.fn()}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })

  it('shows page breadcrumbs in the mention menu', () => {
    const pages: WorkspacePage[] = [
      {
        id: 'root',
        title: '知识库',
        icon: 'book',
        parentId: null,
        updatedAt: '2026-08-12T00:00:00.000Z',
        lastVisitedAt: '2026-08-12T00:00:00.000Z',
        archivedAt: null,
        content: '',
      },
      {
        id: 'child',
        title: '规范',
        icon: 'note',
        parentId: 'root',
        updatedAt: '2026-08-12T00:00:00.000Z',
        lastVisitedAt: '2026-08-12T00:00:00.000Z',
        archivedAt: null,
        content: '',
      },
    ]
    render(
      <PageMentionMenu state={menuState} pages={[pages[1]!]} allPages={pages} onSelect={vi.fn()} onHighlight={vi.fn()} />,
    )

    expect(screen.getByText('知识库 / 规范')).toBeInTheDocument()
  })

  it('announces an informative empty menu and replaces unavailable keyboard actions', () => {
    render(
      <PageMentionMenu
        state={{ ...menuState, query: '不存在' }}
        pages={[]}
        allPages={[]}
        onSelect={vi.fn()}
        onHighlight={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('没有与“不存在”匹配的页面')
    expect(screen.getByText('关闭')).toBeInTheDocument()
    expect(screen.queryByText('选择')).not.toBeInTheDocument()
    expect(screen.queryByText('链接')).not.toBeInTheDocument()
  })

  it('synchronizes pointer and focus highlights with the keyboard selection index', () => {
    const onHighlight = vi.fn()
    const commands = ['文本', '标题'].map((label) => ({
      label,
      hint: `插入${label}`,
      keywords: label,
      icon: FileText,
      run: vi.fn(),
    }))
    render(
      <SlashCommandMenu
        state={menuState}
        commands={commands}
        onSelect={vi.fn()}
        onHighlight={onHighlight}
      />,
    )

    const heading = screen.getByRole('menuitem', { name: /标题/u })
    expect(screen.getByRole('menuitem', { name: /文本/u })).toHaveAttribute('aria-current', 'true')
    expect(heading).not.toHaveAttribute('aria-current')
    fireEvent.mouseEnter(heading)
    fireEvent.focus(heading)
    expect(onHighlight).toHaveBeenNthCalledWith(1, 1)
    expect(onHighlight).toHaveBeenNthCalledWith(2, 1)
  })
})
