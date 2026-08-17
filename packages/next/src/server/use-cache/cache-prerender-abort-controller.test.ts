import { CachePrerenderAbortController } from './cache-prerender-abort-controller'

describe('CachePrerenderAbortController', () => {
  it('forwards dynamic access aborts', () => {
    const dynamicAccessController = new AbortController()
    const timeoutController = new AbortController()
    const controller = new CachePrerenderAbortController(
      dynamicAccessController.signal,
      timeoutController.signal
    )
    const reason = new Error('dynamic access')

    dynamicAccessController.abort(reason)

    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBe(reason)
  })

  it('forwards timeout aborts without a dynamic access signal', () => {
    const timeoutController = new AbortController()
    const controller = new CachePrerenderAbortController(
      undefined,
      timeoutController.signal
    )
    const reason = new Error('timeout')

    timeoutController.abort(reason)

    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBe(reason)
  })

  it('uses an already-aborted dynamic access signal', () => {
    const dynamicAccessController = new AbortController()
    const timeoutController = new AbortController()
    const dynamicAccessReason = new Error('dynamic access')
    dynamicAccessController.abort(dynamicAccessReason)
    timeoutController.abort(new Error('timeout'))

    const controller = new CachePrerenderAbortController(
      dynamicAccessController.signal,
      timeoutController.signal
    )

    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBe(dynamicAccessReason)
  })

  it('removes source listeners when disposed', () => {
    const dynamicAccessController = new AbortController()
    const timeoutController = new AbortController()
    const controller = new CachePrerenderAbortController(
      dynamicAccessController.signal,
      timeoutController.signal
    )

    controller.dispose()
    dynamicAccessController.abort(new Error('dynamic access'))
    timeoutController.abort(new Error('timeout'))

    expect(controller.signal.aborted).toBe(false)
  })

  it('removes the other source listener after an abort', () => {
    const dynamicAccessController = new AbortController()
    const timeoutController = new AbortController()
    const removeDynamicAccessListener = jest.spyOn(
      dynamicAccessController.signal,
      'removeEventListener'
    )
    const removeTimeoutListener = jest.spyOn(
      timeoutController.signal,
      'removeEventListener'
    )
    const controller = new CachePrerenderAbortController(
      dynamicAccessController.signal,
      timeoutController.signal
    )

    dynamicAccessController.abort(new Error('dynamic access'))

    expect(removeDynamicAccessListener).toHaveBeenCalledWith(
      'abort',
      controller
    )
    expect(removeTimeoutListener).toHaveBeenCalledWith('abort', controller)
  })
})
