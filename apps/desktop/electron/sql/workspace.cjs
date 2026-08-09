/**
 * 工作区页面领域的 SQL 清单。
 *
 * SQL 只在数据访问层出现，业务服务通过具名语句访问数据库。集中维护可以让
 * 查询审查、索引核对和 SQLite 方言迁移不再依赖搜索业务代码。
 */
module.exports = Object.freeze({
  configure: `
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `,
  listPages: `
    SELECT id, title, icon, parent_id, favorite, content,
           updated_at, last_visited_at, archived_at
    FROM pages
    ORDER BY last_visited_at DESC
  `,
  activePage: 'SELECT active_page_id FROM workspace_state WHERE singleton = 1',
  upsertPage: `
    INSERT INTO pages (
      id, title, icon, parent_id, favorite, content,
      updated_at, last_visited_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      icon = excluded.icon,
      parent_id = excluded.parent_id,
      favorite = excluded.favorite,
      content = excluded.content,
      updated_at = excluded.updated_at,
      last_visited_at = excluded.last_visited_at,
      archived_at = excluded.archived_at
  `,
  setActivePage: `
    INSERT INTO workspace_state(singleton, active_page_id) VALUES (1, ?)
    ON CONFLICT(singleton) DO UPDATE SET active_page_id = excluded.active_page_id
  `,
  markVisited: 'UPDATE pages SET last_visited_at = ? WHERE id = ?',
  archivePage: 'UPDATE pages SET archived_at = ?, updated_at = ? WHERE id = ?',
  restorePage: 'UPDATE pages SET archived_at = NULL, updated_at = ? WHERE id = ?',
  searchPages: `
    SELECT p.id, p.title, p.icon, p.parent_id, p.favorite, p.content,
           p.updated_at, p.last_visited_at, p.archived_at,
           bm25(pages_fts, 8.0, 1.0) AS rank
    FROM pages_fts
    JOIN pages p ON p.rowid = pages_fts.rowid
    WHERE pages_fts MATCH ? AND p.archived_at IS NULL
    ORDER BY rank, p.last_visited_at DESC
    LIMIT ?
  `,
  recentPages: `
    SELECT id, title, icon, parent_id, favorite, content,
           updated_at, last_visited_at, archived_at
    FROM pages
    WHERE archived_at IS NULL
    ORDER BY last_visited_at DESC
    LIMIT ?
  `,
})
