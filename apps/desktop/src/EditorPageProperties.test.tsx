import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspacePage } from './domain'
import { EditorPageProperties } from './EditorPageProperties'

const page: WorkspacePage = {
  id: 'meeting',
  title: '季度产品讨论会',
  icon: 'book',
  parentId: null,
  updatedAt: '2026-08-12T08:00:00.000Z',
  lastVisitedAt: '2026-08-12T08:00:00.000Z',
  archivedAt: null,
  content: '<p>会议内容</p>',
}

afterEach(cleanup)

describe('EditorPageProperties', () => {
  it('renders the page date and a truthful empty participant state', () => {
    render(<EditorPageProperties page={page} collaborators={[]} onAddParticipant={vi.fn()} />)
    expect(screen.getByLabelText('页面属性')).toHaveTextContent('2026年8月12日')
    expect(screen.getByText('未添加参与者')).toBeInTheDocument()
    expect(screen.queryByText('@Ming')).not.toBeInTheDocument()
  })

  it('renders active collaborators as participant chips', () => {
    render(
      <EditorPageProperties
        page={page}
        collaborators={[{ clientId: 'lin', name: 'Lin', color: '#2383e2' }]}
        onAddParticipant={vi.fn()}
      />,
    )
    expect(screen.getByText('@Lin')).toBeInTheDocument()
    expect(screen.queryByText('@Ming')).not.toBeInTheDocument()
  })

  it('opens participant management from the add control', () => {
    const onAddParticipant = vi.fn()
    render(
      <EditorPageProperties
        page={page}
        collaborators={[]}
        onAddParticipant={onAddParticipant}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '添加参与者' }))
    expect(onAddParticipant).toHaveBeenCalledOnce()
  })
})
