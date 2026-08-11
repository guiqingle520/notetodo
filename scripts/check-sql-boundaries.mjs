import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'

const electronRoot = join(process.cwd(), 'apps', 'desktop', 'electron')
const violations = []

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) visit(path)
    else if (extname(entry.name) === '.cjs') inspect(path)
  }
}

function inspect(path) {
  const source = readFileSync(path, 'utf8')
  const localPath = relative(electronRoot, path)
  const inSqlLayer = localPath.startsWith(`sql${sep}`)
  const inRepositoryLayer = localPath.startsWith(`repositories${sep}`)
  const isMigration =
    localPath === 'workspace-db-migrations.cjs' || localPath.startsWith(`migrations${sep}`)

  // Domain and IPC modules may invoke repositories, but must never compile or execute SQL themselves.
  if (
    !inSqlLayer &&
    !inRepositoryLayer &&
    !isMigration &&
    /\b(?:this\.)?database\s*\.\s*(?:prepare|exec)\s*\(/u.test(source)
  ) {
    violations.push(`${localPath}: 业务层直接访问 SQLite`)
  }

  // Repositories compile named statements; SQL text itself belongs to sql/ or immutable migrations.
  if (
    inRepositoryLayer &&
    /['"`]\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA)\b/iu.test(source)
  ) {
    violations.push(`${localPath}: 仓储层包含内嵌 SQL 文本`)
  }

  if ((inSqlLayer || isMigration) && /\bSELECT\s+\*/iu.test(source)) {
    violations.push(`${localPath}: 禁止 SELECT *，必须显式声明列`)
  }
}

visit(electronRoot)
if (violations.length) {
  console.error(`SQL 分层门禁失败：\n${violations.join('\n')}`)
  process.exitCode = 1
} else console.log('SQL 边界门禁通过：业务层零 SQL，查询显式声明列。')
