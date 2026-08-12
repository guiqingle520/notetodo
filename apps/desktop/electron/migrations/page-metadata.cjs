const pageMetadataSql = require('../sql/page-metadata.cjs')

/** Adds optional page metadata without rewriting rich-text content. */
function migratePageMetadata(database, currentVersion) {
  const columnNames = () =>
    new Set(database.prepare(pageMetadataSql.pageColumns).all().map((column) => column.name))
  if (currentVersion < 20) {
    if (columnNames().has('description'))
      database.prepare(pageMetadataSql.markDescriptionVersion).run()
    else database.exec(pageMetadataSql.addDescription)
  }
  if (currentVersion < 21) {
    if (columnNames().has('cover')) database.prepare(pageMetadataSql.markCoverVersion).run()
    else database.exec(pageMetadataSql.addCover)
  }
}

module.exports = { migratePageMetadata }
