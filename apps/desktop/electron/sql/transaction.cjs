/** SQLite transaction control statements shared by repositories. */
module.exports = Object.freeze({
  begin: 'BEGIN IMMEDIATE',
  commit: 'COMMIT',
  rollback: 'ROLLBACK',
})
