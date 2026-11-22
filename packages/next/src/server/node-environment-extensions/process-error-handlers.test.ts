/**
 * @jest-environment node
 */

import { installProcessErrorHandlers } from './process-error-handlers'

describe('uncaughtException handler', () => {
  let consoleError: jest.SpyInstance
  let handler: NodeJS.UncaughtExceptionListener
  let originalListeners: Array<(...args: any[]) => void>

  const originalStdioListeners = new Map<
    NodeJS.WriteStream,
    Array<(...args: any[]) => void>
  >()

  beforeAll(() => {
    originalListeners = process.listeners('uncaughtException')
    for (const stream of [process.stdout, process.stderr]) {
      originalStdioListeners.set(
        stream,
        stream.listeners('error') as Array<(...args: any[]) => void>
      )
    }
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
    for (const stream of [process.stdout, process.stderr]) {
      for (const listener of stream.listeners('error')) {
        if (!originalStdioListeners.get(stream)?.includes(listener)) {
          stream.removeListener('error', listener)
        }
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

  describe.each(['stdout', 'stderr'] as const)('when %s fails', (name) => {
    it.each(['EIO', 'EPIPE'])(
      'swallows failed writes (%s) instead of logging them back to the broken stream',
      (code) => {
        const error = Object.assign(new Error(`write ${code}`), {
          code,
          syscall: 'write',
        })
        // Without a listener, emitting "error" would throw (and end up in the
        // uncaughtException handler, which logs to the same broken stream).
        expect(() => process[name].emit('error', error)).not.toThrow()
        expect(consoleError).not.toHaveBeenCalled()
      }
    )

    it('rethrows other stream errors so they are still reported', () => {
      const error = Object.assign(new Error('write EACCES'), {
        code: 'EACCES',
        syscall: 'write',
      })
      expect(() => process[name].emit('error', error)).toThrow(error)
    })
  })

  it.each(['EIO', 'EPIPE'])(
    'still logs write errors (%s) that do not come from stdout/stderr',
    (code) => {
      const error = Object.assign(new Error(`write ${code}`), {
        code,
        syscall: 'write',
      })
      handler(error, 'uncaughtException')
      expect(consoleError).toHaveBeenCalledWith(error)
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
