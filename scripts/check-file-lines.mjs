import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1))
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.css', '.scss', '.sql'])
const ignored = new Set(['node_modules', 'dist', 'coverage', '.git'])
const violations = []

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) visit(path)
    else if (codeExtensions.has(extname(entry.name))) {
      const lines = readFileSync(path, 'utf8').split(/\r?\n/u).length
      if (lines > 1000) violations.push(`${relative(root, path)}: ${lines} 行`)
    }
  }
}

visit(root)
if (violations.length) {
  console.error(`以下代码文件超过 1000 行：\n${violations.join('\n')}`)
  process.exitCode = 1
} else console.log('代码文件行数门禁通过：所有文件均不超过 1000 行。')
