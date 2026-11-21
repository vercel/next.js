/**
 * @jest-environment node
 */

import { installProcessErrorHandlers } from './process-error-handlers'

describe('uncaughtException handler', () => {
  let consoleError: jest.SpyInstance
  let handler: NodeJS.UncaughtExceptionListener
  let originalListeners: Array<(...args: any[]) => void>

  beforeAll(() => {
    originalListeners = process.listeners('uncaughtException')
    installProcessErrorHandlers(false)
    const listeners = process.listeners('uncaughtException')
    handler = listeners[listeners.length - 1]
  })

  afterAll(() => {
    for (const listener of process.listeners('uncaughtException')) {
      if (!originalListeners.includes(listener)) {
        process.removeListener('uncaughtException', listener)
      }
    }
    delete (
      globalThis as typeof globalThis & {
        nextInitializedProcessErrorHandlers?: boolean
      }
    ).nextInitializedProcessErrorHandlers
  })

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('logs regular uncaught exceptions', () => {
    const error = new Error('boom')
    handler(error, 'uncaughtException')
    expect(consoleError).toHaveBeenCalledWith(error)
  })

  it.each(['EIO', 'EPIPE'])(
    'does not log failed writes to stdout/stderr (%s) to avoid an infinite loop',
    (code) => {
      const error = Object.assign(new Error(`write ${code}`), {
        code,
        syscall: 'write',
      })
      handler(error, 'uncaughtException')
      expect(consoleError).not.toHaveBeenCalled()
    }
  )

  it('still logs errors with the same code from other syscalls', () => {
    const error = Object.assign(new Error('read EIO'), {
      code: 'EIO',
      syscall: 'read',
    })
    handler(error, 'uncaughtException')
    expect(consoleError).toHaveBeenCalledWith(error)
  })
})
