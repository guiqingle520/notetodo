import { describe, expect, it } from 'vitest'
import { createPageFromTemplate, pageTemplates } from './page-templates'

describe('page templates', () => {
  it('creates independent pages with the requested parent and structured content', () => {
    const page = createPageFromTemplate('parent', 'meeting')
    expect(page).toMatchObject({ parentId: 'parent', title: '会议纪要', icon: 'book', archivedAt: null })
    expect(page.content).toContain('<h2>决策</h2>')
    expect(page.id).toBeTruthy()
  })

  it('keeps every built-in template addressable and non-empty', () => {
    expect(new Set(pageTemplates.map((template) => template.id)).size).toBe(pageTemplates.length)
    expect(pageTemplates.every((template) => template.name && template.content)).toBe(true)
  })
})
