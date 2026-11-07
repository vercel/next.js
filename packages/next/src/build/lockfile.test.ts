import { Lockfile } from './lockfile'
import * as Log from './output/log'
import { getBindingsSync } from './swc'

jest.mock('./swc', () => ({ getBindingsSync: jest.fn() }))
jest.mock('./output/log', () => ({ info: jest.fn(), warn: jest.fn() }))

const WAITING_MESSAGE = 'Waiting for the lock...'

const nativeLockfile = { __napiType: 'Lockfile' }
const ACQUIRED = { type: 'acquired', lockfile: nativeLockfile }
const WOULD_BLOCK = { type: 'wouldBlock' }
function lockfileError({
  transient = false,
  unsupported = false,
}: {
  transient?: boolean
  unsupported?: boolean
}) {
  return {
    type: 'error',
    error: { message: 'An IO error occurred', transient, unsupported },
  }
}

function mockBindings(lockfileTryAcquireSync: jest.Mock) {
  ;(getBindingsSync as jest.Mock).mockReturnValue({
    isWasm: false,
    lockfileTryAcquireSync,
    lockfileUnlock: jest.fn().mockResolvedValue(undefined),
    lockfileUnlockSync: jest.fn(),
  })
}

describe('Lockfile.unlock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('resolves when the native unlock fails', async () => {
    const lockfileUnlock = jest
      .fn()
      .mockRejectedValue(new Error('An IO error occurred'))
    ;(getBindingsSync as jest.Mock).mockReturnValue({
      isWasm: false,
      lockfileTryAcquireSync: () => ACQUIRED,
      lockfileUnlock,
    })

    const lockfile = Lockfile.tryAcquire('/lock', false)!

    await expect(lockfile.unlock()).resolves.toBeUndefined()
    expect(lockfileUnlock).toHaveBeenCalledTimes(1)
  })
})

describe('Lockfile.acquireWithWait', () => {
  const acquiredLocks: Lockfile[] = []

  async function acquireWithWait(
    options: Partial<Parameters<typeof Lockfile.acquireWithWait>[1]> = {}
  ) {
    const lockfile = await Lockfile.acquireWithWait('/lock', {
      waitingMessage: WAITING_MESSAGE,
      ...options,
    })
    if (lockfile) acquiredLocks.push(lockfile)
    return lockfile
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(async () => {
    // Remove the exit listeners registered by `tryAcquire`.
    await Promise.all(acquiredLocks.splice(0).map((lock) => lock.unlock()))
    jest.useRealTimers()
  })

  it('waits silently for a lock that is released quickly', async () => {
    const tryAcquireSync = jest
      .fn()
      .mockReturnValueOnce(WOULD_BLOCK)
      .mockReturnValueOnce(WOULD_BLOCK)
      .mockReturnValue(ACQUIRED)
    mockBindings(tryAcquireSync)

    const acquired = acquireWithWait({ pollMs: 1, warnAfterMs: 10_000 })
    await jest.advanceTimersByTimeAsync(2)

    await expect(acquired).resolves.toBeInstanceOf(Lockfile)
    expect(tryAcquireSync).toHaveBeenCalledTimes(3)
    expect(Log.info).not.toHaveBeenCalled()
    expect(Log.warn).not.toHaveBeenCalled()
  })

  it('logs the waiting message once after the threshold', async () => {
    let released = false
    mockBindings(jest.fn(() => (released ? ACQUIRED : WOULD_BLOCK)))

    const acquired = acquireWithWait({
      pollMs: 1,
      warnAfterMs: 10,
      timeoutMs: 10_000,
    })
    await jest.advanceTimersByTimeAsync(9)
    expect(Log.info).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(30)
    released = true
    await jest.advanceTimersByTimeAsync(1)

    await expect(acquired).resolves.toBeInstanceOf(Lockfile)
    expect(Log.info).toHaveBeenCalledTimes(1)
    expect(Log.info).toHaveBeenCalledWith(WAITING_MESSAGE)
    expect(Log.warn).not.toHaveBeenCalled()
  })

  it('proceeds without the lock after the timeout', async () => {
    mockBindings(jest.fn(() => WOULD_BLOCK))

    const acquired = acquireWithWait({
      pollMs: 1,
      warnAfterMs: 5,
      timeoutMs: 20,
    })
    await jest.advanceTimersByTimeAsync(20)

    await expect(acquired).resolves.toBeUndefined()
    expect(Log.info).toHaveBeenCalledTimes(1)
    expect(Log.warn).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting through transient errors', async () => {
    const tryAcquireSync = jest
      .fn()
      .mockReturnValueOnce(lockfileError({ transient: true }))
      .mockReturnValue(ACQUIRED)
    mockBindings(tryAcquireSync)

    const acquired = acquireWithWait({ pollMs: 1 })
    await jest.advanceTimersByTimeAsync(1)

    await expect(acquired).resolves.toBeInstanceOf(Lockfile)
    expect(tryAcquireSync).toHaveBeenCalledTimes(2)
    expect(Log.warn).not.toHaveBeenCalled()
  })

  it('proceeds without the lock on other I/O errors', async () => {
    const tryAcquireSync = jest.fn(() => lockfileError({}))
    mockBindings(tryAcquireSync)

    await expect(acquireWithWait()).resolves.toBeUndefined()
    expect(tryAcquireSync).toHaveBeenCalledTimes(1)
    expect(Log.warn).not.toHaveBeenCalled()
  })

  it('proceeds without locking if it is unsupported', async () => {
    const tryAcquireSync = jest.fn(() => lockfileError({ unsupported: true }))
    mockBindings(tryAcquireSync)

    await expect(acquireWithWait()).resolves.toBeInstanceOf(Lockfile)
    expect(tryAcquireSync).toHaveBeenCalledTimes(1)
  })

  it('proceeds without the lock with WASM bindings', async () => {
    const tryAcquireSync = jest.fn()
    ;(getBindingsSync as jest.Mock).mockReturnValue({
      isWasm: true,
      lockfileTryAcquireSync: tryAcquireSync,
    })

    await expect(acquireWithWait()).resolves.toBeUndefined()
    expect(tryAcquireSync).not.toHaveBeenCalled()
  })
})
