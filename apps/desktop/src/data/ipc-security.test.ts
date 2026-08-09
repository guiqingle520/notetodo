// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createTrustedIpcHandler, createTrustedIpcListener } =
  require('../../electron/ipc-security.cjs') as {
    createTrustedIpcHandler: (
      ipcMain: {
        handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void
      },
      options: { isDevelopment: boolean; developmentUrl: string; packagedRendererPath: string },
    ) => {
      (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
      (
        channel: string,
        contract: {
          assertRequest: (args: unknown[]) => void
          assertResponse: (value: unknown) => void
        },
        listener: (event: unknown, ...args: unknown[]) => unknown,
      ): void
    }
    createTrustedIpcListener: (
      ipcMain: {
        on: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void
      },
      options: { isDevelopment: boolean; developmentUrl: string; packagedRendererPath: string },
    ) => {
      (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
      (
        channel: string,
        contract: { assertRequest: (args: unknown[]) => void },
        listener: (event: unknown, ...args: unknown[]) => unknown,
      ): void
    }
  }

describe('trusted IPC registration', () => {
  it('accepts the configured renderer and rejects remote or malformed frames', () => {
    let registered: ((event: unknown, ...args: unknown[]) => unknown) | undefined
    const ipcMain = {
      handle: vi.fn((_channel, listener) => {
        registered = listener
      }),
    }
    const handleTrusted = createTrustedIpcHandler(ipcMain, {
      isDevelopment: true,
      developmentUrl: 'http://127.0.0.1:5173',
      packagedRendererPath: 'D:/app/dist/index.html',
    })
    const listener = vi.fn(() => 'ok')
    handleTrusted('page:load', listener)

    expect(registered).toBeTypeOf('function')
    expect(registered!({ senderFrame: { url: 'http://127.0.0.1:5173/page' } })).toBe('ok')
    expect(() => registered!({ senderFrame: { url: 'https://attacker.example/' } })).toThrow(
      /not trusted/,
    )
    expect(() => registered!({ senderFrame: { url: 'invalid' } })).toThrow(/not trusted/)
  })

  it('drops untrusted events and accepts the packaged entry with a fragment', () => {
    let registered: ((event: unknown, ...args: unknown[]) => unknown) | undefined
    const ipcMain = {
      on: vi.fn((_channel, listener) => {
        registered = listener
      }),
    }
    const onTrusted = createTrustedIpcListener(ipcMain, {
      isDevelopment: false,
      developmentUrl: 'http://127.0.0.1:5173',
      packagedRendererPath: 'D:/app/dist/index.html',
    })
    const listener = vi.fn()
    onTrusted('model:cancel', listener)

    expect(registered).toBeTypeOf('function')
    registered!({ senderFrame: { url: 'https://attacker.example/' } }, 'request-1')
    registered!({ senderFrame: { url: 'file:///D:/app/dist/index.html#workspace' } }, 'request-2')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.anything(), 'request-2')
  })

  it('rejects unsafe requests and responses at the shared contract boundary', () => {
    let registered: ((event: unknown, ...args: unknown[]) => unknown) | undefined
    const ipcMain = {
      handle: vi.fn((_channel, listener) => {
        registered = listener
      }),
    }
    const handleTrusted = createTrustedIpcHandler(ipcMain, {
      isDevelopment: true,
      developmentUrl: 'http://127.0.0.1:5173',
      packagedRendererPath: 'D:/app/dist/index.html',
    })
    const trustedEvent = { senderFrame: { url: 'http://127.0.0.1:5173/' } }
    handleTrusted('page:load', () => ({ invalid: () => undefined }))
    expect(() => registered!(trustedEvent)).toThrow(/non-serializable/)

    handleTrusted('page:save', () => 'ok')
    expect(() => registered!(trustedEvent, { constructor: 'unsafe' })).toThrow(/unsafe property/)
  })

  it('applies channel-specific request and response contracts to sync and async handlers', async () => {
    let registered: ((event: unknown, ...args: unknown[]) => unknown) | undefined
    const ipcMain = {
      handle: vi.fn((_channel, listener) => {
        registered = listener
      }),
    }
    const handleTrusted = createTrustedIpcHandler(ipcMain, {
      isDevelopment: true,
      developmentUrl: 'http://127.0.0.1:5173',
      packagedRendererPath: 'D:/app/dist/index.html',
    })
    const trustedEvent = { senderFrame: { url: 'http://127.0.0.1:5173/' } }
    const contract = {
      assertRequest: (args: unknown[]) => {
        if (args.length !== 0) throw new TypeError('No arguments allowed.')
      },
      assertResponse: (value: unknown) => {
        if (value !== 'valid') throw new TypeError('Invalid channel response.')
      },
    }

    handleTrusted('app:sync-info', contract, () => 'valid')
    expect(registered!(trustedEvent)).toBe('valid')
    expect(() => registered!(trustedEvent, 'unexpected')).toThrow(/No arguments/)

    handleTrusted('app:async-info', contract, async () => 'invalid')
    await expect(registered!(trustedEvent)).rejects.toThrow(/Invalid channel response/)
  })

  it('applies channel-specific request contracts to one-way listeners', () => {
    let registered: ((event: unknown, ...args: unknown[]) => unknown) | undefined
    const ipcMain = {
      on: vi.fn((_channel, listener) => {
        registered = listener
      }),
    }
    const onTrusted = createTrustedIpcListener(ipcMain, {
      isDevelopment: true,
      developmentUrl: 'http://127.0.0.1:5173',
      packagedRendererPath: 'D:/app/dist/index.html',
    })
    const listener = vi.fn()
    onTrusted(
      'model:cancel-chat',
      {
        assertRequest: (args) => {
          if (args[0] !== 'valid-id') throw new TypeError('Invalid listener request.')
        },
      },
      listener,
    )
    const trustedEvent = { senderFrame: { url: 'http://127.0.0.1:5173/' } }

    expect(() => registered!(trustedEvent, 'invalid-id')).toThrow(/Invalid listener request/)
    registered!(trustedEvent, 'valid-id')
    expect(listener).toHaveBeenCalledOnce()
  })
})
