import { Lockfile } from './lockfile'
import * as Log from './output/log'
import { getBindingsSync } from './swc'

jest.mock('./swc', () => ({ getBindingsSync: jest.fn() }))
jest.mock('./output/log', () => ({ info: jest.fn(), warn: jest.fn() }))

const WAITING_MESSAGE = 'Waiting for the lock...'

describe('Lockfile.acquireWithWait', () => {
  const lockfile = {} as Lockfile
  let tryAcquire: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    ;(getBindingsSync as jest.Mock).mockReturnValue({ isWasm: false })
    tryAcquire = jest.spyOn(Lockfile, 'tryAcquire')
  })

  afterEach(() => {
    tryAcquire.mockRestore()
    jest.useRealTimers()
  })

  it('waits silently for a lock that is released quickly', async () => {
    tryAcquire
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockReturnValue(lockfile)

    const acquired = Lockfile.acquireWithWait('/lock', {
      pollMs: 1,
      warnAfterMs: 10_000,
      waitingMessage: WAITING_MESSAGE,
    })
    await jest.advanceTimersByTimeAsync(2)

    await expect(acquired).resolves.toBe(lockfile)
    expect(tryAcquire).toHaveBeenCalledTimes(3)
    expect(Log.info).not.toHaveBeenCalled()
    expect(Log.warn).not.toHaveBeenCalled()
  })

  it('logs the waiting message once after the threshold', async () => {
    let released = false
    tryAcquire.mockImplementation(() => (released ? lockfile : undefined))

    const acquired = Lockfile.acquireWithWait('/lock', {
      pollMs: 1,
      warnAfterMs: 10,
      timeoutMs: 10_000,
      waitingMessage: WAITING_MESSAGE,
    })
    await jest.advanceTimersByTimeAsync(9)
    expect(Log.info).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(30)
    released = true
    await jest.advanceTimersByTimeAsync(1)

    await expect(acquired).resolves.toBe(lockfile)
    expect(Log.info).toHaveBeenCalledTimes(1)
    expect(Log.info).toHaveBeenCalledWith(WAITING_MESSAGE)
    expect(Log.warn).not.toHaveBeenCalled()
  })

  it('proceeds without the lock after the timeout', async () => {
    tryAcquire.mockReturnValue(undefined)

    const acquired = Lockfile.acquireWithWait('/lock', {
      pollMs: 1,
      warnAfterMs: 5,
      timeoutMs: 20,
      waitingMessage: WAITING_MESSAGE,
    })
    await jest.advanceTimersByTimeAsync(20)

    await expect(acquired).resolves.toBeUndefined()
    expect(Log.info).toHaveBeenCalledTimes(1)
    expect(Log.warn).toHaveBeenCalledTimes(1)
  })

  it('proceeds without the lock if it cannot be created', async () => {
    tryAcquire.mockImplementation(() => {
      throw new Error('An IO error occurred')
    })

    await expect(
      Lockfile.acquireWithWait('/lock', { waitingMessage: WAITING_MESSAGE })
    ).resolves.toBeUndefined()
    expect(tryAcquire).toHaveBeenCalledTimes(1)
    expect(Log.warn).not.toHaveBeenCalled()
  })

  it('proceeds without the lock with WASM bindings', async () => {
    ;(getBindingsSync as jest.Mock).mockReturnValue({ isWasm: true })

    await expect(
      Lockfile.acquireWithWait('/lock', { waitingMessage: WAITING_MESSAGE })
    ).resolves.toBeUndefined()
    expect(tryAcquire).not.toHaveBeenCalled()
  })
})
