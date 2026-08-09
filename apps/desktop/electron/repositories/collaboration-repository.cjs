const sql = require('../sql/collaboration.cjs')

function createCollaborationRepository(database) {
  const statements = Object.fromEntries(
    Object.entries(sql)
      .filter(([key]) => !['begin', 'commit', 'rollback'].includes(key))
      .map(([key, query]) => [key, database.prepare(query)]),
  )
  return Object.freeze({
    ...statements,
    transaction(work) {
      database.exec(sql.begin)
      try {
        const result = work()
        database.exec(sql.commit)
        return result
      } catch (error) {
        database.exec(sql.rollback)
        throw error
      }
    },
  })
}

module.exports = { createCollaborationRepository }
