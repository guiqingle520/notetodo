const recordsSql = require('../sql/database-records.cjs')

/** 预编译数据库记录快照查询；调用方负责领域映射与权限/业务校验。 */
function createDatabaseRecordRepository(database) {
  return Object.freeze({
    databaseByPage: database.prepare(recordsSql.databaseByPage),
    propertiesByDatabase: database.prepare(recordsSql.propertiesByDatabase),
    activeRecordsByDatabase: database.prepare(recordsSql.activeRecordsByDatabase),
    valuesByRecord: database.prepare(recordsSql.valuesByRecord),
    viewsByDatabase: database.prepare(recordsSql.viewsByDatabase),
    templatesByDatabase: database.prepare(recordsSql.templatesByDatabase),
    pageByDatabase: database.prepare(recordsSql.pageByDatabase),
  })
}

module.exports = { createDatabaseRecordRepository }
