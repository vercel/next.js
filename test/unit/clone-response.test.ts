/**
 * @jest-environment node
 */

describe('cloneResponse', () => {
  let cloneResponse: typeof import('../../packages/next/src/server/lib/clone-response').cloneResponse
  let finalize: (ref: WeakRef<ReadableStream>) => void
  let register: jest.Mock

  beforeEach(() => {
    register = jest.fn()
    // Control finalization without depending on when the garbage collector runs.
    const registry = jest
      .spyOn(globalThis, 'FinalizationRegistry')
      .mockImplementation((callback) => {
        finalize = callback
        return { register } as unknown as FinalizationRegistry<unknown>
      })

    try {
      jest.isolateModules(() => {
        cloneResponse =
          require('../../packages/next/src/server/lib/clone-response').cloneResponse
      })
    } finally {
      registry.mockRestore()
    }
  })

  it('handles cleanup failure after the consumer catches a body error', async () => {
    let controller: ReadableStreamDefaultController
    const original = new Response(
      new ReadableStream({
        start(value) {
          controller = value
        },
      })
    )
    const [consumed, unused] = cloneResponse(original)
    const read = consumed.json()
    const error = new TypeError('terminated')

    controller!.error(error)
    await expect(read).rejects.toBe(error)
    expect(unused.body!.locked).toBe(false)

    const unusedRef = register.mock.calls.find(
      ([response]) => response === unused
    )![1]
    finalize(unusedRef)

    // An ignored cancellation rejection is reported on the next event-loop turn.
    await new Promise<void>((resolve) => setImmediate(resolve))
  })

  it('keeps both cloned bodies independently readable', async () => {
    const [first, second] = cloneResponse(new Response('value'))

    expect(await Promise.all([first.text(), second.text()])).toEqual([
      'value',
      'value',
    ])
  })
})
