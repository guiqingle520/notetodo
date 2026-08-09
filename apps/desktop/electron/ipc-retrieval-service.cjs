/** Runs retrieval with the main-process identity so SQL applies page permissions before ranking. */
function searchWorkspace(database, query, limit = 8) {
  const userId = database.getSetting('collaboration_user_id')
  return database.hybridSearch(query, userId, limit)
}

module.exports = { searchWorkspace }
