const MAX_PAGE_COUNT = 100_000
const MAX_PAGE_CONTENT_LENGTH = 20_000_000
const pageIcons = new Set(['spark', 'note', 'check', 'grid', 'book'])

function assertId(value, label = 'id') {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) {
    throw new TypeError(`Invalid workspace page ${label}.`)
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Invalid workspace page ${label}.`)
  }
}

function assertCover(value) {
  if (value === undefined || value === '') return
  if (typeof value !== 'string' || value.length > 2_048) {
    throw new TypeError('Invalid workspace page cover.')
  }
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'notetodo-asset:' ||
      !/^[0-9a-f]{64}$/u.test(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname === '/'
    ) {
      throw new TypeError('Invalid workspace page cover.')
    }
  } catch {
    throw new TypeError('Invalid workspace page cover.')
  }
}

function assertWorkspacePage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('A workspace page object is required.')
  }

  const allowedFields = new Set([
    'id',
    'title',
    'description',
    'cover',
    'icon',
    'parentId',
    'favorite',
    'updatedAt',
    'lastVisitedAt',
    'archivedAt',
    'content',
  ])
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new TypeError('Workspace page contains unexpected fields.')
  }

  assertId(value.id)
  if (typeof value.title !== 'string' || value.title.length > 1_000) {
    throw new TypeError('Invalid workspace page title.')
  }
  if (
    value.description !== undefined &&
    (typeof value.description !== 'string' || value.description.length > 2_000)
  ) {
    throw new TypeError('Invalid workspace page description.')
  }
  assertCover(value.cover)
  if (!pageIcons.has(value.icon)) throw new TypeError('Invalid workspace page icon.')
  if (value.parentId !== null) assertId(value.parentId, 'parent id')
  if (value.favorite !== undefined && typeof value.favorite !== 'boolean') {
    throw new TypeError('Invalid workspace page favorite state.')
  }
  if (typeof value.content !== 'string' || value.content.length > MAX_PAGE_CONTENT_LENGTH) {
    throw new TypeError('Workspace page content exceeds the local safety limit.')
  }
  assertTimestamp(value.updatedAt, 'updated timestamp')
  assertTimestamp(value.lastVisitedAt, 'last visited timestamp')
  if (value.archivedAt !== null) assertTimestamp(value.archivedAt, 'archive timestamp')
}

function assertNoArguments(args) {
  if (args.length !== 0) throw new TypeError('This workspace channel does not accept arguments.')
}

function assertPageArgument(args) {
  if (args.length !== 1) throw new TypeError('Workspace page request requires one argument.')
  assertWorkspacePage(args[0])
}

function assertPageIdArgument(args) {
  if (args.length !== 1) throw new TypeError('Workspace page request requires one id.')
  assertId(args[0])
}

function assertSearchArgument(args) {
  if (args.length !== 1 || typeof args[0] !== 'string' || args[0].length > 500) {
    throw new TypeError('Invalid workspace search query.')
  }
}

function assertVoidResponse(value) {
  if (value !== undefined)
    throw new TypeError('Workspace mutation returned an unexpected response.')
}

function assertPageArray(value) {
  if (!Array.isArray(value) || value.length > MAX_PAGE_COUNT) {
    throw new TypeError('Invalid workspace page collection.')
  }
  value.forEach(assertWorkspacePage)
}

function assertWorkspaceSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid workspace snapshot.')
  }
  const keys = Object.keys(value)
  if (keys.length !== 2 || !keys.includes('pages') || !keys.includes('activePageId')) {
    throw new TypeError('Invalid workspace snapshot fields.')
  }

  assertPageArray(value.pages)
  if (typeof value.activePageId !== 'string' || value.activePageId.length > 128) {
    throw new TypeError('Invalid active workspace page id.')
  }
  const pageById = new Map(value.pages.map((page) => [page.id, page]))
  if (pageById.size !== value.pages.length)
    throw new TypeError('Workspace page ids must be unique.')
  if (value.activePageId) {
    const activePage = pageById.get(value.activePageId)
    if (!activePage || activePage.archivedAt) {
      throw new TypeError('Active workspace page must reference an unarchived page.')
    }
  }
}

const voidPageMutationContract = Object.freeze({
  assertRequest: assertPageIdArgument,
  assertResponse: assertVoidResponse,
})

/** Runtime contracts for the complete workspace preload surface. */
const workspaceIpcContracts = Object.freeze({
  load: Object.freeze({
    assertRequest: assertNoArguments,
    assertResponse: assertWorkspaceSnapshot,
  }),
  upsertPage: Object.freeze({
    assertRequest: assertPageArgument,
    assertResponse: assertWorkspacePage,
  }),
  setActivePage: voidPageMutationContract,
  archivePage: voidPageMutationContract,
  restorePage: voidPageMutationContract,
  search: Object.freeze({
    assertRequest: assertSearchArgument,
    assertResponse: assertPageArray,
  }),
})

module.exports = { assertWorkspacePage, workspaceIpcContracts }
