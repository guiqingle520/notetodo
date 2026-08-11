# RFC：SQLite UTC Unix 毫秒迁移

## 决策

时间字段从 ISO 文本切换为 UTC Unix 毫秒必须采用三阶段兼容流程，禁止原地覆盖：

1. Schema v19 建立 `timestamp_compat_backup` 和迁移状态表，原 ISO 列仍为唯一权威来源；
2. 后续版本进入 `dual-write`，所有写入同时更新 ISO 与 Unix 毫秒，并对读取结果抽样校验；
3. 仅当备份恢复、降级打开和全量一致性检查持续通过后，才进入 `unix-primary`。

## v19 恢复保证

- 每个非空时间值保存表名、主键、列名、原 ISO 文本和解析后的安全整数；
- 任一非法时间会使整个迁移事务回滚，Schema 版本不会推进；
- `restoreUtcTimestampBackup` 在单事务内恢复原值，可供降级或灾难恢复工具调用；
- Renderer、IPC 和开放 API 继续使用 ISO 8601，存储格式不会泄漏到公共契约。

## 切换门禁

- 备份行数与源时间值行数一致；
- `new Date(unix_ms).toISOString()` 与规范化 ISO 值一致；
- 迁移前数据库副本、v19 数据库和恢复副本通过相同 WorkspaceDatabase 集成测试；
- 发布前必须验证旧版只读打开和新版恢复工具，不允许静默丢失或改变时区。
