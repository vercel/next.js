import { Lockfile } from './lockfile'
import { getBindingsSync } from './swc'

jest.mock('./swc', () => ({ getBindingsSync: jest.fn() }))

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
      lockfileTryAcquireSync: () => ({}),
      lockfileUnlock,
    })

    const lockfile = Lockfile.tryAcquire('/lock', false)!

    await expect(lockfile.unlock()).resolves.toBeUndefined()
    expect(lockfileUnlock).toHaveBeenCalledTimes(1)
  })
})
