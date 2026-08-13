import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspacePage } from './domain'
import { PageBreadcrumbs } from './PageBreadcrumbs'

afterEach(cleanup)

const page = (id: string, title: string): WorkspacePage => ({
  id, title, icon: 'note', parentId: null, updatedAt: '2026-08-13T00:00:00.000Z', lastVisitedAt: '2026-08-13T00:00:00.000Z', archivedAt: null, content: '<p></p>',
})

describe('page breadcrumbs', () => {
  it('navigates to ancestors and marks the current page', () => {
    const onNavigate = vi.fn()
    render(<PageBreadcrumbs pages={[page('root', '产品路线'), page('current', '本周计划')]} onNavigate={onNavigate} />)

    expect(screen.getByRole('navigation', { name: '页面路径' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '产品路线' }))
    expect(onNavigate).toHaveBeenCalledWith('root')
    expect(screen.getByText('本周计划')).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: '本周计划' })).not.toBeInTheDocument()
  })

  it('uses the same untitled fallback as the page editor', () => {
    render(<PageBreadcrumbs pages={[page('current', '   ')]} onNavigate={vi.fn()} />)
    expect(screen.getByText('无标题')).toHaveAttribute('aria-current', 'page')
  })
})
