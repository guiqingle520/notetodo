import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const workspaceRoots = ['apps', 'packages']
const packages = new Map()
const violations = []

for (const workspaceRoot of workspaceRoots) {
  const directory = join(root, workspaceRoot)
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const packagePath = join(directory, entry.name, 'package.json')
    if (!existsSync(packagePath)) continue
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))
    packages.set(manifest.name, {
      directory: join(directory, entry.name),
      kind: workspaceRoot === 'packages' ? 'package' : 'app',
      manifest,
    })
  }
}

const graph = new Map([...packages.keys()].map((name) => [name, new Set()]))
for (const [name, workspace] of packages) {
  const declared = {
    ...workspace.manifest.dependencies,
    ...workspace.manifest.optionalDependencies,
    ...workspace.manifest.peerDependencies,
  }
  for (const dependency of Object.keys(declared)) {
    if (!packages.has(dependency)) continue
    graph.get(name).add(dependency)
    const target = packages.get(dependency)
    if (workspace.kind === 'package' && target.kind === 'app') {
      violations.push(`${name}: 基础包不得依赖应用 ${dependency}`)
    }
    if (workspace.kind === 'app' && target.kind === 'app') {
      violations.push(`${name}: 应用不得直接依赖另一应用 ${dependency}`)
    }
  }

  inspectSourceImports(name, workspace, declared)
  inspectTypeScriptBaseline(name, workspace)
}

function inspectSourceImports(name, workspace, declared) {
  const sourceRoot = join(workspace.directory, 'src')
  if (!existsSync(sourceRoot)) return
  visit(sourceRoot, (path) => {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(
      /(?:from\s+|import\s*\(|require\s*\()\s*['"](@notetodo\/[^/'"]+)/gu,
    )) {
      const dependency = match[1]
      if (dependency !== name && packages.has(dependency) && !Object.hasOwn(declared, dependency)) {
        violations.push(`${relative(root, path)}: 使用了未声明的内部依赖 ${dependency}`)
      }
    }
  })
}

function inspectTypeScriptBaseline(name, workspace) {
  const sourceRoot = join(workspace.directory, 'src')
  if (!existsSync(sourceRoot)) return
  let containsTypeScript = false
  visit(sourceRoot, (path) => {
    if (/\.tsx?$/u.test(path)) containsTypeScript = true
  })
  if (!containsTypeScript) return
  const configPath = join(workspace.directory, 'tsconfig.json')
  if (!existsSync(configPath)) {
    violations.push(`${name}: TypeScript 工作区缺少 tsconfig.json`)
    return
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  if (config.extends !== '../../tsconfig.base.json') {
    violations.push(`${name}: tsconfig.json 未继承根目录统一基线`)
  }
}

function visit(directory, inspect) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) visit(path, inspect)
    else if (/\.(?:ts|tsx|js|jsx|cjs|mjs)$/u.test(entry.name)) inspect(path)
  }
}

const visiting = new Set()
const visited = new Set()
function detectCycle(name, trail = []) {
  if (visiting.has(name)) {
    const cycleStart = trail.indexOf(name)
    violations.push(`内部包循环依赖：${[...trail.slice(cycleStart), name].join(' -> ')}`)
    return
  }
  if (visited.has(name)) return
  visiting.add(name)
  for (const dependency of graph.get(name)) detectCycle(dependency, [...trail, name])
  visiting.delete(name)
  visited.add(name)
}
for (const name of packages.keys()) detectCycle(name)

if (violations.length) {
  console.error(`包边界门禁失败：\n${[...new Set(violations)].join('\n')}`)
  process.exitCode = 1
} else console.log('包边界门禁通过：依赖已声明、方向正确且无循环。')
