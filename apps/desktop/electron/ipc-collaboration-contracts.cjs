const pageRoles = new Set(['viewer', 'commenter', 'editor', 'owner'])
const assignablePageRoles = new Set(['viewer', 'commenter', 'editor'])

function assertId(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) {
    throw new TypeError(`Invalid collaboration ${label}.`)
  }
}

function assertPageRequest(args) {
  if (args.length !== 1) throw new TypeError('Collaboration request requires one page id.')
  assertId(args[0], 'page id')
}

function assertTicketResponse(value) {
  if (value === null) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid collaboration ticket response.')
  }
  const allowedFields = new Set(['endpoint', 'token', 'userId', 'name', 'color', 'role'])
  const keys = Object.keys(value)
  if (keys.length !== 6 || keys.some((field) => !allowedFields.has(field))) {
    throw new TypeError('Invalid collaboration ticket response fields.')
  }

  const endpoint = new URL(value.endpoint)
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new TypeError('Invalid collaboration endpoint.')
  }
  if (typeof value.token !== 'string' || value.token.length < 1 || value.token.length > 8_192) {
    throw new TypeError('Invalid collaboration ticket token.')
  }
  assertId(value.userId, 'user id')
  if (typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 80) {
    throw new TypeError('Invalid collaboration user name.')
  }
  if (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/iu.test(value.color)) {
    throw new TypeError('Invalid collaboration user color.')
  }
  if (!pageRoles.has(value.role)) throw new TypeError('Invalid collaboration role.')
}

function assertPermission(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid page permission response.')
  }
  const keys = Object.keys(value)
  if (
    keys.length !== 3 ||
    !keys.includes('subjectId') ||
    !keys.includes('displayName') ||
    !keys.includes('role')
  ) {
    throw new TypeError('Invalid page permission response fields.')
  }
  assertId(value.subjectId, 'subject id')
  if (
    typeof value.displayName !== 'string' ||
    value.displayName.length < 1 ||
    value.displayName.length > 80
  ) {
    throw new TypeError('Invalid page permission display name.')
  }
  if (!pageRoles.has(value.role)) throw new TypeError('Invalid page permission role.')
}

function assertPermissionList(value) {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new TypeError('Invalid page permission collection.')
  }
  value.forEach(assertPermission)
}

function assertUpsertRequest(args) {
  if (args.length !== 4) {
    throw new TypeError('Page permission write requires page, subject, name, and role.')
  }
  assertId(args[0], 'page id')
  assertId(args[1], 'subject id')
  if (typeof args[2] !== 'string' || args[2].length < 1 || args[2].length > 80) {
    throw new TypeError('Invalid page permission display name.')
  }
  // Ownership transfer is a separate privileged operation and must never be
  // smuggled through the ordinary member role editor.
  if (!assignablePageRoles.has(args[3])) throw new TypeError('Invalid assignable page role.')
}

function assertRemoveRequest(args) {
  if (args.length !== 2)
    throw new TypeError('Page permission removal requires page and subject ids.')
  assertId(args[0], 'page id')
  assertId(args[1], 'subject id')
}

function assertVoidResponse(value) {
  if (value !== undefined) throw new TypeError('Page permission mutation returned unexpected data.')
}

const collaborationIpcContracts = Object.freeze({
  getTicket: Object.freeze({
    assertRequest: assertPageRequest,
    assertResponse: assertTicketResponse,
  }),
  listPermissions: Object.freeze({
    assertRequest: assertPageRequest,
    assertResponse: assertPermissionList,
  }),
  upsertPermission: Object.freeze({
    assertRequest: assertUpsertRequest,
    assertResponse: assertVoidResponse,
  }),
  removePermission: Object.freeze({
    assertRequest: assertRemoveRequest,
    assertResponse: assertVoidResponse,
  }),
})

module.exports = { collaborationIpcContracts }
