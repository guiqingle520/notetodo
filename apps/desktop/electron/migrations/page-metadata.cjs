const pageMetadataSql = require('../sql/page-metadata.cjs')

/** Adds optional page metadata without rewriting rich-text content. */
function migratePageMetadata(database, currentVersion) {
  if (currentVersion >= 20) return
  const descriptionExists = database
    .prepare(pageMetadataSql.pageColumns)
    .all()
    .some((column) => column.name === 'description')
  if (descriptionExists) database.prepare(pageMetadataSql.markVersion).run()
  else database.exec(pageMetadataSql.addDescription)
}

module.exports = { migratePageMetadata }
