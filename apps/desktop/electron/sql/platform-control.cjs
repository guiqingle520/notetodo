module.exports = Object.freeze({
  begin: 'BEGIN IMMEDIATE',
  commit: 'COMMIT',
  rollback: 'ROLLBACK',
  saveAutomation: 'SAVEPOINT automation_rule',
  releaseAutomation: 'RELEASE SAVEPOINT automation_rule',
  rollbackAutomation: 'ROLLBACK TO SAVEPOINT automation_rule',
  saveReplay: 'SAVEPOINT automation_replay',
  releaseReplay: 'RELEASE SAVEPOINT automation_replay',
  rollbackReplay: 'ROLLBACK TO SAVEPOINT automation_replay',
})
