const platformSql = require('../sql/platform.cjs')

const controlSql = Object.freeze({
  begin: 'BEGIN IMMEDIATE', commit: 'COMMIT', rollback: 'ROLLBACK',
  saveAutomation: 'SAVEPOINT automation_rule', releaseAutomation: 'RELEASE SAVEPOINT automation_rule', rollbackAutomation: 'ROLLBACK TO SAVEPOINT automation_rule',
  saveReplay: 'SAVEPOINT automation_replay', releaseReplay: 'RELEASE SAVEPOINT automation_replay', rollbackReplay: 'ROLLBACK TO SAVEPOINT automation_replay',
})

function createPlatformRepository(database) {
  return Object.freeze({
    ...Object.fromEntries(Object.entries(platformSql).map(([key, query]) => [key, database.prepare(query)])),
    control: (operation) => database.exec(controlSql[operation]),
    transaction(work) {
      database.exec(controlSql.begin)
      try { const result = work(); database.exec(controlSql.commit); return result }
      catch (error) { database.exec(controlSql.rollback); throw error }
    },
  })
}

module.exports = { createPlatformRepository }
