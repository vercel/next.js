import { once } from 'node:events'
import { NodeNextResponse } from 'next/dist/server/base-http/node'
import { WebNextResponse } from 'next/dist/server/base-http/web'
import { SYMBOL_CLEARED_COOKIES } from 'next/dist/server/api-utils'
import { MockedResponse } from 'next/dist/server/lib/mock-request'
import { createDevResponseLifecycle } from 'next/dist/server/route-modules/app-page/dev-response-lifecycle'

describe('development response lifecycle', () => {
  it('does not observe the response or install listeners when constructed', () => {
    const raw = new MockedResponse()
    const response = new NodeNextResponse(raw)
    const originalResponse = jest.spyOn(response, 'originalResponse', 'get')
    const finishListeners = raw.listenerCount('finish')

    const lifecycle = createDevResponseLifecycle(response)

    expect(lifecycle).toBeDefined()
    expect(originalResponse).not.toHaveBeenCalled()
    expect(raw.listenerCount('close')).toBe(0)
    expect(raw.listenerCount('finish')).toBe(finishListeners)
    originalResponse.mockRestore()
  })

  it('observes current completion state and synchronizes wrapper state lazily', async () => {
    const raw = new MockedResponse()
    const response = new NodeNextResponse(raw)
    const lifecycle = createDevResponseLifecycle(response)!

    response[SYMBOL_CLEARED_COOKIES] = true
    expect(Reflect.get(raw, SYMBOL_CLEARED_COOKIES)).toBeUndefined()
    expect(lifecycle.isFinished()).toBe(false)
    expect(Reflect.get(raw, SYMBOL_CLEARED_COOKIES)).toBe(true)

    const finished = once(raw, 'finish')
    raw.end()
    await finished
    expect(lifecycle.isFinished()).toBe(true)
  })

  it('aborts when the client disconnects before completion', async () => {
    const raw = new MockedResponse()
    const lifecycle = createDevResponseLifecycle(new NodeNextResponse(raw))!
    const signal = lifecycle.getCloseSignal()
    expect(signal.aborted).toBe(false)

    const closed = once(raw, 'close')
    raw.destroy()
    await closed

    expect(signal.aborted).toBe(true)
    expect(signal.reason.name).toBe('ResponseAborted')
  })

  it('observes disconnection that happened after binding but before signal creation', async () => {
    const raw = new MockedResponse()
    const lifecycle = createDevResponseLifecycle(new NodeNextResponse(raw))!
    const closed = once(raw, 'close')
    raw.destroy()
    await closed

    const signal = lifecycle.getCloseSignal()
    expect(signal.aborted).toBe(true)
    expect(signal.reason.name).toBe('ResponseAborted')
  })

  it('does not abort a response that finishes normally', async () => {
    const raw = new MockedResponse()
    const lifecycle = createDevResponseLifecycle(new NodeNextResponse(raw))!
    const signal = lifecycle.getCloseSignal()
    const closed = once(raw, 'close')

    raw.end()
    await closed

    expect(signal.aborted).toBe(false)
    expect(lifecycle.isFinished()).toBe(true)
  })

  it('waits for completion and removes its listeners', async () => {
    const raw = new MockedResponse()
    const lifecycle = createDevResponseLifecycle(new NodeNextResponse(raw))!
    const finishListeners = raw.listenerCount('finish')
    const completed = lifecycle.waitForFinish()
    expect(raw.listenerCount('finish')).toBe(finishListeners + 1)
    expect(raw.listenerCount('close')).toBe(1)

    raw.end()

    await expect(completed).resolves.toBe(true)
    expect(raw.listenerCount('finish')).toBe(finishListeners)
    expect(raw.listenerCount('close')).toBe(0)
  })

  it('reports premature closure without treating it as completion', async () => {
    const raw = new MockedResponse()
    const lifecycle = createDevResponseLifecycle(new NodeNextResponse(raw))!
    const finishListeners = raw.listenerCount('finish')
    const completed = lifecycle.waitForFinish()

    raw.destroy()

    await expect(completed).resolves.toBe(false)
    expect(lifecycle.isFinished()).toBe(false)
    expect(raw.listenerCount('finish')).toBe(finishListeners)
    expect(raw.listenerCount('close')).toBe(0)
  })

  it('leaves Edge responses without Node lifecycle capabilities', () => {
    const previousRuntime = process.env.NEXT_RUNTIME
    process.env.NEXT_RUNTIME = 'edge'
    try {
      expect(createDevResponseLifecycle(new WebNextResponse())).toBeUndefined()
    } finally {
      if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME
      else process.env.NEXT_RUNTIME = previousRuntime
    }
  })
})
