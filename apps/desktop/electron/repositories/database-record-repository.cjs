const recordsSql = require('../sql/database-records.cjs')
const transactionSql = require('../sql/transaction.cjs')

/** 预编译数据库记录快照查询；调用方负责领域映射与权限/业务校验。 */
function createDatabaseRecordRepository(database) {
  return Object.freeze({
    ...Object.fromEntries(
      Object.entries(recordsSql).map(([key, query]) => [key, database.prepare(query)]),
    ),
    transaction(work) {
      database.exec(transactionSql.begin)
      try {
        const result = work()
        database.exec(transactionSql.commit)
        return result
      } catch (error) {
        database.exec(transactionSql.rollback)
        throw error
      }
    },
  })
}

module.exports = { createDatabaseRecordRepository }
