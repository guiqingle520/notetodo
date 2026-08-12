/** Versioned SQL for page presentation metadata. */
module.exports = Object.freeze({
  pageColumns: 'PRAGMA table_info(pages)',
  markVersion: `INSERT INTO app_meta(key, value) VALUES ('schema_version', '20')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  addDescription: `
    BEGIN IMMEDIATE;
    ALTER TABLE pages ADD COLUMN description TEXT NOT NULL DEFAULT ''
      CHECK(length(description) <= 2000);
    INSERT INTO app_meta(key, value) VALUES ('schema_version', '20')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    COMMIT;
  `,
})
