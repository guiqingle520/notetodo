import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) =>
  value.slice(1),
)
const codeExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.cjs',
  '.mjs',
  '.css',
  '.scss',
  '.sql',
])
const ignored = new Set(['node_modules', 'dist', 'coverage', '.git'])
const violations = []
// Existing large modules are frozen at their current ceiling and must shrink over time.
// Every new module is limited to 500 lines; the absolute compatibility ceiling remains 1000.
const legacyLargeFileBudgets = Object.freeze({
  'apps/desktop/electron/main.cjs': 732,
  'apps/desktop/electron/workspace-db-migrations.cjs': 518,
  'apps/desktop/electron/workspace-db-records.cjs': 590,
  'apps/desktop/src/App.tsx': 895,
  'apps/desktop/src/DatabaseBlock.tsx': 821,
  'apps/desktop/src/data/workspace-db.test.ts': 579,
  'apps/desktop/src/editor/rich-blocks.ts': 530,
  'apps/desktop/src/styles-base.css': 788,
  'apps/desktop/src/styles-features.css': 770,
  'packages/database-core/src/index.ts': 801,
})

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) visit(path)
    else if (codeExtensions.has(extname(entry.name))) {
      const lines = readFileSync(path, 'utf8').split(/\r?\n/u).length
      const localPath = relative(root, path).replaceAll('\\', '/')
      const budget = legacyLargeFileBudgets[localPath] ?? 500
      if (lines > Math.min(1000, budget)) {
        violations.push(`${localPath}: ${lines} 行，预算为 ${Math.min(1000, budget)} 行`)
      }
    }
  }
}

visit(root)
if (violations.length) {
  console.error(`以下代码文件超过行数预算：\n${violations.join('\n')}`)
  process.exitCode = 1
} else console.log('代码文件行数门禁通过：新文件不超过 500 行，存量文件未增长且均低于 1000 行。')
