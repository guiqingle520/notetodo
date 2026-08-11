import { readFileSync } from 'node:fs'

const main = readFileSync('apps/desktop/electron/main.cjs', 'utf8')
const preload = readFileSync('apps/desktop/electron/preload.cjs', 'utf8')
const html = readFileSync('apps/desktop/index.html', 'utf8')
const failures = []

const requirePattern = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message)
}
const rejectPattern = (source, pattern, message) => {
  if (pattern.test(source)) failures.push(message)
}

requirePattern(main, /contextIsolation:\s*true/u, 'BrowserWindow must enable contextIsolation.')
requirePattern(main, /nodeIntegration:\s*false/u, 'BrowserWindow must disable nodeIntegration.')
requirePattern(main, /sandbox:\s*true/u, 'BrowserWindow must enable the renderer sandbox.')
requirePattern(
  main,
  /setWindowOpenHandler/u,
  'External windows must pass through an explicit policy.',
)
requirePattern(main, /return \{ action: 'deny' \}/u, 'Renderer-created windows must be denied.')
requirePattern(
  preload,
  /contextBridge\.exposeInMainWorld/u,
  'Preload must expose an explicit context bridge.',
)
requirePattern(
  html,
  /Content-Security-Policy/u,
  'Renderer HTML must define a Content Security Policy.',
)
rejectPattern(main, /webSecurity:\s*false/u, 'webSecurity cannot be disabled.')
rejectPattern(
  main,
  /allowRunningInsecureContent:\s*true/u,
  'Insecure mixed content cannot be enabled.',
)
rejectPattern(
  preload,
  /exposeInMainWorld\([^,]+,\s*(?:ipcRenderer|require|process)\b/u,
  'Preload cannot expose Node or raw IPC objects.',
)

if (failures.length) {
  console.error(`Electron 安全发布门禁失败：\n${failures.join('\n')}`)
  process.exitCode = 1
} else {
  console.log('Electron 安全发布门禁通过：隔离、沙箱、CSP、窗口策略和 Preload 边界有效。')
}
