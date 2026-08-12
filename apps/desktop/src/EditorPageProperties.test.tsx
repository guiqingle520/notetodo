import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
  it('renders the page date and local participant fallback', () => {
    render(<EditorPageProperties page={page} collaborators={[]} />)
    expect(screen.getByLabelText('页面属性')).toHaveTextContent('2026年8月12日')
    expect(screen.getByText('@Ming')).toBeInTheDocument()
  })

  it('renders active collaborators as participant chips', () => {
    render(
      <EditorPageProperties
        page={page}
        collaborators={[{ clientId: 'lin', name: 'Lin', color: '#2383e2' }]}
      />,
    )
    expect(screen.getByText('@Lin')).toBeInTheDocument()
    expect(screen.queryByText('@Ming')).not.toBeInTheDocument()
  })
})
