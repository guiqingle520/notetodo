import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test } from '@playwright/test'

const desktopDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

test('edits and restores a page through the sandboxed Electron application', async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'notetodo-playwright-'))
  const application = await electron.launch({
    args: [desktopDirectory],
    cwd: desktopDirectory,
    env: {
      ...process.env,
      NOTETODO_E2E_TEST: '1',
      NOTETODO_E2E_DATA_DIR: dataDirectory,
    },
  })

  try {
    const window = await application.firstWindow()
    await expect(window.locator('.sidebar')).toBeVisible()
    await expect(window.getByRole('heading', { name: '早上好，Ming' })).toBeVisible()
    await window.getByRole('button', { name: '所有页面' }).click()
    await expect(window.getByRole('heading', { name: '所有页面' })).toBeVisible()
    await window.getByRole('button', { name: '打开页面：产品路线' }).click()
    await expect(window.getByLabel('页面标题')).toHaveValue(/\S+/u)

    const security = await window.evaluate(async () => ({
      processType: typeof globalThis.process,
      requireType: typeof (globalThis as typeof globalThis & { require?: unknown }).require,
      bridgeAvailable: typeof window.notetodo?.workspace.load === 'function',
      appInfo: await window.notetodo?.getAppInfo(),
    }))
    expect(security).toMatchObject({
      processType: 'undefined',
      requireType: 'undefined',
      bridgeAvailable: true,
    })
    expect(security.appInfo?.platform).toBe(process.platform)

    const title = window.getByLabel('页面标题')
    await title.fill('Playwright 恢复旅程')
    await window.locator('.editor-content .ProseMirror').click()
    await window.keyboard.press('Control+End')
    await window.keyboard.type('发布门禁持久化内容')
    await window.waitForTimeout(700)
    await window.reload()

    await window.locator('.page-row').filter({ hasText: 'Playwright 恢复旅程' }).click()
    await expect(window.getByLabel('页面标题')).toHaveValue('Playwright 恢复旅程')
    await expect(window.locator('.editor-content .ProseMirror')).toContainText('发布门禁持久化内容')
  } finally {
    await application.close()
    rmSync(dataDirectory, { recursive: true, force: true })
  }
})
