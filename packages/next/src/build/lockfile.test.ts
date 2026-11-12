import { Lockfile } from './lockfile'
import { getBindingsSync } from './swc'

jest.mock('./swc', () => ({ getBindingsSync: jest.fn() }))

describe('Lockfile.unlock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('resolves and removes the exit listener when unlocking fails', async () => {
    const lockfileUnlock = jest
      .fn()
      .mockRejectedValue(new Error('An IO error occurred'))
    ;(getBindingsSync as jest.Mock).mockReturnValue({
      isWasm: false,
      lockfileTryAcquireSync: () => ({}),
      lockfileUnlock,
    })
    const on = jest.spyOn(process, 'on').mockReturnValue(process)
    const off = jest.spyOn(process, 'off').mockReturnValue(process)
    try {
      const lockfile = Lockfile.tryAcquire('/lock')!
      expect(on).toHaveBeenCalledWith('exit', expect.any(Function))

      await expect(lockfile.unlock()).resolves.toBeUndefined()
      expect(lockfileUnlock).toHaveBeenCalledTimes(1)
      expect(off).toHaveBeenCalledWith('exit', on.mock.calls[0][1])
    } finally {
      on.mockRestore()
      off.mockRestore()
    }
  })
})
