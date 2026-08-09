const workspaceSql = require('../sql/workspace.cjs')

/**
 * 编译工作区领域的常用语句。仓储只负责 SQLite 访问，不包含页面业务规则。
 * 语句在数据库实例生命周期内复用，避免每次交互重新解析 SQL。
 */
function createWorkspaceRepository(database) {
  return Object.freeze({
    configure: () => database.exec(workspaceSql.configure),
    // 新工作区必须先执行 schema migration，之后才可以预编译引用数据表的语句。
    prepareStatements: () => Object.freeze({
      listPages: database.prepare(workspaceSql.listPages),
      activePage: database.prepare(workspaceSql.activePage),
      upsertPage: database.prepare(workspaceSql.upsertPage),
      setActivePage: database.prepare(workspaceSql.setActivePage),
      markVisited: database.prepare(workspaceSql.markVisited),
      archivePage: database.prepare(workspaceSql.archivePage),
      restorePage: database.prepare(workspaceSql.restorePage),
      searchPages: database.prepare(workspaceSql.searchPages),
      recentPages: database.prepare(workspaceSql.recentPages),
    }),
  })
}

module.exports = { createWorkspaceRepository }
