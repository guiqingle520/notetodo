import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 迁移期间锁定旧模块的 prepare() 上限：任何新 SQL 都必须进入 sql/ 与
// repositories/。每完成一个领域迁移就下调对应预算，最终收敛为零。
const legacyBudgets = Object.freeze({
  'workspace-db-records.cjs': 96,
  'workspace-db.cjs': 37,
  'workspace-db-platform.cjs': 37,
  'workspace-db-collaboration.cjs': 18,
  'workspace-db-seed.cjs': 17,
  'workspace-db-migrations.cjs': 1,
})
const electronRoot = join(process.cwd(), 'apps', 'desktop', 'electron')
const violations = []

for (const [file, budget] of Object.entries(legacyBudgets)) {
  const source = readFileSync(join(electronRoot, file), 'utf8')
  const count = source.match(/\.prepare\s*\(/gu)?.length ?? 0
  if (count > budget) violations.push(`${file}: ${count} 处，迁移预算为 ${budget}`)
}

if (violations.length) {
  console.error(`业务模块新增了内嵌 SQL：\n${violations.join('\n')}`)
  process.exitCode = 1
} else console.log('SQL 边界门禁通过：业务模块未新增内嵌查询。')
