/**
 * Removes cross-database values when the current actor cannot read the target.
 * The projection keeps the public snapshot shape stable while ensuring relation
 * ids and values derived from them never cross an ACL boundary.
 */
function sanitizeDatabaseSnapshot(snapshot, canReadDatabase) {
  if (!snapshot) return snapshot
  const restrictedRelations = new Set()
  const restrictedDerived = new Set()

  let properties = snapshot.schema.properties.map((property) => {
    if (property.type !== 'relation' || !property.relation?.databaseId) return property
    if (canReadDatabase(property.relation.databaseId)) return property
    restrictedRelations.add(property.id)
    const safeProperty = { ...property }
    delete safeProperty.relation
    return safeProperty
  })

  properties = properties.map((property) => {
    if (
      property.type === 'rollup' &&
      property.rollup?.relationPropertyId &&
      restrictedRelations.has(property.rollup.relationPropertyId)
    ) {
      restrictedDerived.add(property.id)
      const safeProperty = { ...property }
      delete safeProperty.rollup
      return safeProperty
    }
    return property
  })
  // Formula expressions can transitively reference restricted relation or
  // rollup columns. Redacting all formula results is conservative and avoids
  // building a second expression evaluator in the privileged process.
  if (restrictedRelations.size) {
    for (const property of properties) {
      if (property.type === 'formula') restrictedDerived.add(property.id)
    }
  }

  if (!restrictedRelations.size && !restrictedDerived.size) return snapshot
  const restrictedIds = new Set([...restrictedRelations, ...restrictedDerived])
  const redactValues = (values) =>
    Object.fromEntries(
      Object.entries(values).map(([propertyId, value]) => [
        propertyId,
        restrictedIds.has(propertyId) ? null : value,
      ]),
    )

  return {
    ...snapshot,
    schema: { ...snapshot.schema, properties },
    records: snapshot.records.map((record) => ({ ...record, values: redactValues(record.values) })),
    ...(snapshot.templates
      ? {
          templates: snapshot.templates.map((template) => ({
            ...template,
            values: redactValues(template.values),
          })),
        }
      : {}),
  }
}

module.exports = { sanitizeDatabaseSnapshot }
