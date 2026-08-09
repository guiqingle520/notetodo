const fs = require('node:fs')
const path = require('node:path')

/**
 * Creates an import-scoped attachment staging area under the final CAS root.
 * Keeping both locations on one volume allows promotion through hard links,
 * avoiding a second copy of large assets while still supporting rollback.
 */
function createImportAssetStaging(options) {
  const fileSystem = options.fileSystem ?? fs.promises
  const assetStoreDir = path.resolve(options.assetStoreDir)
  const stagingRoot = path.join(assetStoreDir, '.import-staging')
  let initialization

  function initialize() {
    if (!initialization) {
      // No import can write before this shared promise resolves, so stale files
      // from a previous process crash can be removed without racing active work.
      initialization = fileSystem
        .rm(stagingRoot, { recursive: true, force: true })
        .then(() => fileSystem.mkdir(stagingRoot, { recursive: true }))
    }
    return initialization
  }

  async function prepare(importId) {
    if (typeof importId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/u.test(importId)) {
      throw new TypeError('Invalid import staging id.')
    }
    await initialize()
    const directory = resolveWithin(stagingRoot, importId)
    await fileSystem.mkdir(directory, { recursive: true })
    return { directory, createdPaths: [] }
  }

  async function promote(session, attachments, signal) {
    if (!Array.isArray(attachments)) throw new TypeError('Invalid imported attachments.')
    const promoted = new Set()
    for (const attachment of attachments) {
      if (signal?.aborted) throw new Error('IMPORT_CANCELLED')
      const relativePath = attachment?.relativePath
      const hash = attachment?.hash
      if (
        typeof hash !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(hash) ||
        relativePath !== `${hash.slice(0, 2)}/${hash}`
      ) {
        throw new TypeError('Invalid imported attachment location.')
      }
      if (promoted.has(relativePath)) continue
      promoted.add(relativePath)
      const sourcePath = resolveWithin(session.directory, relativePath)
      const targetPath = resolveWithin(assetStoreDir, relativePath)
      await fileSystem.mkdir(path.dirname(targetPath), { recursive: true })
      const created = await linkOrCopyExclusive(fileSystem, sourcePath, targetPath)
      if (created) session.createdPaths.push(targetPath)
      await fileSystem.rm(sourcePath, { force: true })
    }
    if (signal?.aborted) throw new Error('IMPORT_CANCELLED')
  }

  async function cleanup(session, options = {}) {
    if (options.rollback) {
      await Promise.all(
        session.createdPaths.map((targetPath) => fileSystem.rm(targetPath, { force: true })),
      )
    }
    await fileSystem.rm(session.directory, { recursive: true, force: true })
  }

  return Object.freeze({ prepare, promote, cleanup })
}

async function linkOrCopyExclusive(fileSystem, sourcePath, targetPath) {
  try {
    await fileSystem.link(sourcePath, targetPath)
    return true
  } catch (error) {
    if (error?.code === 'EEXIST') return false
    if (!['ENOSYS', 'EPERM', 'EXDEV'].includes(error?.code)) throw error
  }

  try {
    await fileSystem.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL)
    return true
  } catch (error) {
    if (error?.code === 'EEXIST') return false
    throw error
  }
}

function resolveWithin(root, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    throw new TypeError('Invalid import asset path.')
  }
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new TypeError('Import asset path escapes its store.')
  }
  return resolvedPath
}

module.exports = { createImportAssetStaging }
