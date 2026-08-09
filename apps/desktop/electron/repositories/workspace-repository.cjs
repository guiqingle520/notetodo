const workspaceSql = require('../sql/workspace.cjs')
const seedSql = require('../sql/seed.cjs')
const operationSql = require('../sql/workspace-operations.cjs')
const transactionSql = require('../sql/transaction.cjs')

/**
 * 编译工作区领域的常用语句。仓储只负责 SQLite 访问，不包含页面业务规则。
 * 语句在数据库实例生命周期内复用，避免每次交互重新解析 SQL。
 */
function createWorkspaceRepository(database) {
  return Object.freeze({
    configure: () => database.exec(workspaceSql.configure),
    // 新工作区必须先执行 schema migration，之后才可以预编译引用数据表的语句。
    prepareStatements: () => {
      const queries = Object.fromEntries(
        Object.entries(workspaceSql).filter(([key]) => key !== 'configure'),
      )
      return Object.freeze(
        Object.fromEntries(
          Object.entries({ ...queries, ...seedSql, ...operationSql }).map(([key, query]) => [
            key,
            database.prepare(query),
          ]),
        ),
      )
    },
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

module.exports = { createWorkspaceRepository }
