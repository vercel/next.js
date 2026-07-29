import { timeoutsManager } from './resource-managers'

describe('sandbox resource managers', () => {
  afterEach(() => {
    timeoutsManager.removeAll()
  })

  it('does not retain one-shot timeouts after they run', async () => {
    const context = {}
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

    try {
      await Promise.all(
        [0, 1, 2].map(
          () =>
            new Promise<void>((resolve) => {
              timeoutsManager.add([context, resolve, 0] as any)
            })
        )
      )

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(3)

      timeoutsManager.removeAll()

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(3)
    } finally {
      clearTimeoutSpy.mockRestore()
    }
  })

  it('clears timeouts when they are removed explicitly', () => {
    const context = {}
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
    const timeout = timeoutsManager.add([context, () => {}, 1000] as any)

    try {
      timeoutsManager.remove(timeout)

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timeout)
    } finally {
      clearTimeoutSpy.mockRestore()
    }
  })

  it('preserves timeout callback arguments that are functions', async () => {
    const context = {}
    const callbackArg = () => 'value'
    const callback = jest.fn(function (this: unknown, arg: () => string) {
      expect(this).toBe(context)
      expect(arg).toBe(callbackArg)
      expect(arg()).toBe('value')
    })

    await new Promise<void>((resolve) => {
      timeoutsManager.add([
        context,
        function (this: unknown, ...args: Parameters<typeof callback>) {
          callback.apply(this, args)
          resolve()
        },
        0,
        callbackArg,
      ] as any)
    })

    expect(callback).toHaveBeenCalledTimes(1)
  })
})
