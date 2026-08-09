const platformSql = require('../sql/platform.cjs')
const controlSql = require('../sql/platform-control.cjs')

function createPlatformRepository(database) {
  return Object.freeze({
    ...Object.fromEntries(
      Object.entries(platformSql).map(([key, query]) => [key, database.prepare(query)]),
    ),
    control: (operation) => database.exec(controlSql[operation]),
    transaction(work) {
      database.exec(controlSql.begin)
      try {
        const result = work()
        database.exec(controlSql.commit)
        return result
      } catch (error) {
        database.exec(controlSql.rollback)
        throw error
      }
    },
  })
}

module.exports = { createPlatformRepository }
