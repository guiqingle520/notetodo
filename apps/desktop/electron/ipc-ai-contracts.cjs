const patchOperations = new Set(['insert-paragraphs', 'replace-selection'])
const patchStatuses = new Set(['applied', 'undone', 'rejected'])

function assertId(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) {
    throw new TypeError(`Invalid AI patch ${label}.`)
  }
}

function assertCreateRequest(args) {
  if (args.length !== 3)
    throw new TypeError('AI patch proposal requires page, operation, and preview.')
  assertId(args[0], 'page id')
  if (!patchOperations.has(args[1])) throw new TypeError('Invalid AI patch operation.')
  if (typeof args[2] !== 'string' || args[2].trim().length < 1 || args[2].length > 200_000) {
    throw new TypeError('Invalid AI patch preview.')
  }
}

function assertUpdateRequest(args) {
  if (args.length !== 2) throw new TypeError('AI patch update requires id and status.')
  assertId(args[0], 'id')
  if (!patchStatuses.has(args[1])) throw new TypeError('Invalid AI patch status.')
}

function assertIdResponse(value) {
  assertId(value, 'response id')
}

function assertVoidResponse(value) {
  if (value !== undefined) throw new TypeError('AI patch update returned unexpected data.')
}

const aiIpcContracts = Object.freeze({
  createPatchAudit: Object.freeze({
    assertRequest: assertCreateRequest,
    assertResponse: assertIdResponse,
  }),
  updatePatchAudit: Object.freeze({
    assertRequest: assertUpdateRequest,
    assertResponse: assertVoidResponse,
  }),
})

module.exports = { aiIpcContracts }
