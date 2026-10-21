import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { renderWithRequestLifecycle } from 'next/dist/experimental/testing/rsc/render-request'
import type { ServerComponentRenderOutcome } from 'next/dist/experimental/testing/rsc/render'

// Composition checks only: F separately validates the real after() lifecycle.
function setup() {
  const cleanups: Array<() => Promise<void>> = []
  const events: string[] = []
  let complete!: (outcome: ServerComponentRenderOutcome) => void
  let finishAfter!: () => void
  const completed = new Promise<ServerComponentRenderOutcome>((resolve) => {
    complete = resolve
  })
  const after = new Promise<void>((resolve) => {
    finishAfter = resolve
  })
  const transport = {
    stream: new ReadableStream<Uint8Array>(),
    completed,
    dispose: jest.fn(async () => {
      events.push('dispose')
      complete({ status: 'aborted', errors: [] })
    }),
  }
  const lifecycle = {
    close: jest.fn(async () => {
      events.push('close')
      await after
      events.push('drained')
    }),
  }
  const attempt = {
    onCleanup: (cleanup: () => Promise<void>) => cleanups.push(cleanup),
  }
  return {
    attempt,
    lifecycle,
    transport,
    cleanups,
    events,
    complete,
    finishAfter,
  }
}

it('waits for request tasks after transport completion', async () => {
  const fixture = setup()
  const request = renderWithRequestLifecycle(
    fixture.attempt,
    fixture.lifecycle,
    () => fixture.transport
  )
  let finished = false
  void request.completed.then(() => {
    finished = true
  })
  const outcome = { status: 'completed' as const, errors: [] }
  fixture.complete(outcome)
  await fixture.transport.completed
  expect(finished).toBe(false)
  fixture.finishAfter()
  expect(await request.completed).toBe(outcome)
  expect(fixture.events).toEqual(['close', 'drained'])
  await fixture.cleanups[0]()
  expect(fixture.lifecycle.close).toHaveBeenCalledTimes(1)
})

it('disposes transport before closing and drains only once', async () => {
  const fixture = setup()
  const request = renderWithRequestLifecycle(
    fixture.attempt,
    fixture.lifecycle,
    () => fixture.transport
  )
  const disposal = request.dispose()
  expect(request.dispose()).toBe(disposal)
  fixture.finishAfter()
  await disposal
  await fixture.cleanups[0]()
  expect(fixture.events).toEqual(['dispose', 'close', 'drained'])
  expect(fixture.transport.dispose).toHaveBeenCalledTimes(1)
  expect((await request.completed).status).toBe('aborted')
})

it('drains after a synchronous render failure', async () => {
  const fixture = setup()
  const failure = new Error('renderer failed synchronously')
  expect(() =>
    renderWithRequestLifecycle(fixture.attempt, fixture.lifecycle, () => {
      throw failure
    })
  ).toThrow(failure)
  expect(fixture.cleanups).toHaveLength(1)
  fixture.finishAfter()
  await fixture.cleanups[0]()
  expect(fixture.events).toEqual(['close', 'drained'])
})

it('retains disposal and after failures without skipping the drain', async () => {
  const fixture = setup()
  const disposalError = new Error('dispose failed')
  const afterError = new Error('after failed')
  fixture.transport.dispose.mockRejectedValue(disposalError)
  fixture.lifecycle.close.mockRejectedValue(afterError)
  renderWithRequestLifecycle(
    fixture.attempt,
    fixture.lifecycle,
    () => fixture.transport
  )
  await expect(fixture.cleanups[0]()).rejects.toMatchObject({
    errors: [disposalError, afterError],
  })
  expect(fixture.lifecycle.close).toHaveBeenCalledTimes(1)
})

it('reports after errors at attempt cleanup even if completion was ignored', async () => {
  const fixture = setup()
  const afterError = new Error('background after failed')
  fixture.lifecycle.close.mockRejectedValue(afterError)
  const request = renderWithRequestLifecycle(
    fixture.attempt,
    fixture.lifecycle,
    () => fixture.transport
  )
  fixture.complete({ status: 'completed', errors: [] })
  await expect(fixture.cleanups[0]()).rejects.toBe(afterError)
  await expect(request.completed).rejects.toBe(afterError)
  expect(fixture.lifecycle.close).toHaveBeenCalledTimes(1)
})

describe('live full-route response stream', () => {
  const { createRouteStreamResponse } =
    require('next/dist/experimental/testing/rsc/route-stream') as typeof import('next/dist/experimental/testing/rsc/route-stream')
  const RenderResult = require('next/dist/server/render-result')
    .default as typeof import('next/dist/server/render-result').default
  const { createRequestLifecycle } =
    require('next/dist/experimental/testing/request/request-lifecycle') as typeof import('next/dist/experimental/testing/request/request-lifecycle')

  function deferred<T = void>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((yes) => {
      resolve = yes
    })
    return { promise, resolve }
  }
  const bytes = (value: string) => new TextEncoder().encode(value)
  const text = (value?: Uint8Array) => new TextDecoder().decode(value)
  function sourceResult(source: ReadableStream<Uint8Array> | null) {
    return new RenderResult(source, {
      metadata: {},
      contentType: 'text/html; charset=utf-8',
    })
  }
  function make(closeRequest: () => Promise<void> = async () => {}) {
    return createRouteStreamResponse({ url: '/owned-route' }, closeRequest)
  }
  function leaves(error: unknown, seen = new Set<unknown>()): unknown[] {
    if (seen.has(error)) return []
    seen.add(error)
    if (error && typeof error === 'object') {
      if ('errors' in error && Array.isArray(error.errors)) {
        return error.errors.flatMap((item) => leaves(item, seen))
      }
      if ('cause' in error) return leaves(error.cause, seen)
    }
    return [error]
  }

  it('exposes actual fallback bytes and committed detached headers before source/after completion', async () => {
    const release = deferred()
    const afterEntered = deferred()
    const afterRelease = deferred()
    const lifecycle = createRequestLifecycle()
    lifecycle.renderOpts.onClose(() => {
      lifecycle.renderOpts.waitUntil(
        (async () => {
          afterEntered.resolve()
          await afterRelease.promise
        })()
      )
    })
    let pulls = 0
    const source = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (pulls++ === 0) controller.enqueue(bytes('fallback'))
        else {
          await release.promise
          controller.enqueue(bytes('final'))
          controller.close()
        }
      },
    })
    const owned = make(() => lifecycle.close())
    const cookies = ['one=1', 'two=2']
    owned.res.statusCode = 202
    owned.res.setHeader('set-cookie', cookies)
    const { result } = owned.start(sourceResult(source))
    const response = await result.response
    expect(response.status).toBe(202)
    expect(response.headers['set-cookie']).toEqual(['one=1', 'two=2'])
    expect(Object.isFrozen(response)).toBe(true)
    expect(Object.isFrozen(response.headers)).toBe(true)
    expect(Object.isFrozen(response.headers['set-cookie'])).toBe(true)
    cookies.push('later=3')
    owned.res.statusCode = 599
    owned.res.setHeader('set-cookie', ['replacement=4'])
    expect(response.status).toBe(202)
    expect(response.headers['set-cookie']).toEqual(['one=1', 'two=2'])
    const reader = result.stream.getReader()
    expect(text((await reader.read()).value)).toBe('fallback')
    let completed = false
    void result.completed.then(() => {
      completed = true
    })
    expect(completed).toBe(false)
    release.resolve()
    expect(text((await reader.read()).value)).toBe('final')
    expect((await reader.read()).done).toBe(true)
    await afterEntered.promise
    expect(completed).toBe(false)
    afterRelease.resolve()
    await expect(result.completed).resolves.toEqual({ status: 'completed' })
    await result.dispose()
    reader.releaseLock()
    expect(owned.res.closed).toBe(true)
  })

  it('backs off actual source production at native write/drain until the body is consumed', async () => {
    let pulls = 0
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls === 20) return controller.close()
        pulls++
        controller.enqueue(new Uint8Array(8192).fill(pulls))
      },
    })
    const owned = make()
    const blocked = deferred()
    const write = owned.res.write.bind(owned.res)
    owned.res.write = (chunk) => {
      const accepted = write(chunk)
      if (!accepted) blocked.resolve()
      return accepted
    }
    const { result } = owned.start(sourceResult(source))
    await result.response
    await blocked.promise
    expect(pulls).toBeLessThan(20)
    const reader = result.stream.getReader()
    let size = 0
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
    }
    expect(size).toBe(20 * 8192)
    await expect(result.completed).resolves.toEqual({ status: 'completed' })
    reader.releaseLock()
    expect(owned.res.closed).toBe(true)
  })

  it('commits an empty response and makes repeated disposal after completion a no-op', async () => {
    const close = jest.fn(async () => {})
    const owned = make(close)
    owned.res.statusCode = 204
    const { result } = owned.start(sourceResult(null))
    expect((await result.response).status).toBe(204)
    const reader = result.stream.getReader()
    expect((await reader.read()).done).toBe(true)
    const completion = await result.completed
    await result.dispose(new Error('late disposal'))
    await result.dispose(new Error('another disposal'))
    expect(await result.completed).toBe(completion)
    expect(close).toHaveBeenCalledTimes(1)
    reader.releaseLock()
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['string', 'authored reason'],
    ['object', { authored: true }],
    ['Error', new Error('authored error reason')],
  ])(
    'keeps native reader cancellation closed with the original %s reason',
    async (_label, reason) => {
      const cancel = jest.fn()
      const owned = make()
      const { result } = owned.start(
        sourceResult(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes('fallback'))
            },
            cancel,
          })
        )
      )
      await result.response
      const reader = result.stream.getReader()
      await reader.read()
      const pending = reader.read()
      await reader.cancel(reason)
      expect(await pending).toEqual({ value: undefined, done: true })
      const completion = await result.completed
      expect(completion.status).toBe('aborted')
      if (completion.status === 'aborted')
        expect(completion.reason).toBe(reason)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel.mock.calls[0][0]).toMatchObject({ name: 'ResponseAborted' })
      reader.releaseLock()
      expect(owned.res.closed).toBe(true)
    }
  )

  it('rejects a pending read with the exact explicit disposal reason', async () => {
    const owned = make()
    const { result } = owned.start(
      sourceResult(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes('fallback'))
          },
        })
      )
    )
    await result.response
    const reader = result.stream.getReader()
    await reader.read()
    const pending = reader.read()
    const reason = new Error('explicit disposal')
    const rejectedRead = pending.catch((error) => error)
    const disposal = result.dispose(reason)
    expect(result.dispose()).toBe(disposal)
    await disposal
    expect(await rejectedRead).toBe(reason)
    await expect(result.completed).resolves.toEqual({
      status: 'aborted',
      reason,
    })
    reader.releaseLock()
    expect(owned.res.closed).toBe(true)
  })

  it.each([false, true])(
    'preserves actual pipe Error identity and source cause afterCommit=%s',
    async (afterCommit) => {
      const reason = new Error('real source failed')
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const owned = make()
      const { result } = owned.start(
        sourceResult(
          new ReadableStream({
            start(value) {
              controller = value
              if (afterCommit) value.enqueue(bytes('fallback'))
              else value.error(reason)
            },
          })
        )
      )
      const reader = result.stream.getReader()
      let responseError: unknown
      if (afterCommit) {
        await result.response
        await reader.read()
        controller.error(reason)
      } else {
        await expect(result.response).rejects.toMatchObject({
          message: 'failed to pipe response',
          cause: reason,
        })
        try {
          await result.response
        } catch (error) {
          responseError = error
        }
      }
      let actual: unknown
      try {
        await reader.read()
      } catch (error) {
        actual = error
      }
      expect(actual).toMatchObject({
        message: 'failed to pipe response',
        cause: reason,
      })
      if (!afterCommit) expect(actual).toBe(responseError)
      let failure: unknown
      try {
        await result.completed
      } catch (error) {
        failure = error
      }
      expect(leaves(failure)).toEqual([reason])
      await expect(result.dispose()).rejects.toBe(failure)
      reader.releaseLock()
      expect(owned.res.closed).toBe(true)
    }
  )

  it('retains a real source AbortError rather than classifying it as owned cancellation', async () => {
    const reason = new DOMException('real source abort', 'AbortError')
    const owned = make()
    const { result } = owned.start(
      sourceResult(
        new ReadableStream({
          start(controller) {
            controller.error(reason)
          },
        })
      )
    )
    await expect(result.response).rejects.toBe(reason)
    const reader = result.stream.getReader()
    await expect(reader.read()).rejects.toBe(reason)
    await expect(result.completed).rejects.toBe(reason)
    reader.releaseLock()
    expect(owned.res.closed).toBe(true)
  })

  it('retains distinct response and after AbortErrors during intentional cancellation', async () => {
    const entered = deferred()
    const release = deferred()
    const responseError = new DOMException('real response abort', 'AbortError')
    const afterError = new DOMException('real after abort', 'AbortError')
    const lifecycle = createRequestLifecycle()
    lifecycle.renderOpts.onClose(() => {
      lifecycle.renderOpts.waitUntil(
        (async () => {
          entered.resolve()
          await release.promise
          throw afterError
        })()
      )
    })
    const owned = make(() => lifecycle.close())
    const { result } = owned.start(
      sourceResult(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes('fallback'))
          },
        })
      )
    )
    await result.response
    const reader = result.stream.getReader()
    await reader.read()
    const pending = reader.read()
    const readFailure = pending.catch((error) => error)
    owned.res.emit('error', responseError)
    const disposing = result.dispose(new Error('intentional reason'))
    void disposing.catch(() => {})
    await entered.promise
    release.resolve()
    let failure: unknown
    try {
      await result.completed
    } catch (error) {
      failure = error
    }
    expect(leaves(failure)).toEqual([responseError, afterError])
    await expect(disposing).rejects.toBe(failure)
    expect(await readFailure).toBe(responseError)
    reader.releaseLock()
    expect(owned.res.closed).toBe(true)
  })
  it('joins an unread native tail when real request cleanup fails after piping ends', async () => {
    const afterEntered = deferred()
    let rejectAfter!: (error: Error) => void
    const after = new Promise<void>((_resolve, reject) => {
      rejectAfter = reject
    })
    const failure = new Error('request cleanup failed with queued body bytes')
    const owned = make(() => {
      afterEntered.resolve()
      return after
    })
    const { piping, result } = owned.start(
      sourceResult(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes('first'))
            controller.enqueue(bytes('second'))
            controller.enqueue(bytes('unread native tail'))
            controller.close()
          },
        })
      )
    )
    await result.response
    const reader = result.stream.getReader()
    expect(text((await reader.read()).value)).toBe('first')
    await piping
    await afterEntered.promise
    let state = 'pending'
    const observed = result.completed.then(
      () => {
        state = 'completed'
      },
      () => {
        state = 'rejected'
      }
    )
    try {
      rejectAfter(failure)
      await after.catch(() => {})
      await expect(reader.read()).rejects.toBe(failure)
      // A real event-loop boundary follows the settled pipe, response and
      // cleanup promises; queued body bytes must not retain a native reader.
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(state).toBe('rejected')
      await expect(result.completed).rejects.toBe(failure)
    } finally {
      await Promise.allSettled([result.dispose(), observed])
      reader.releaseLock()
    }
    expect(owned.res.closed).toBe(true)
  })
  it('retains an actual source-cancel failure while native pending reads close', async () => {
    const failure = new Error('real source cancellation failed')
    const owned = make()
    const { result } = owned.start(
      sourceResult(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes('fallback'))
          },
          cancel() {
            throw failure
          },
        })
      )
    )
    await result.response
    const reader = result.stream.getReader()
    await reader.read()
    const pending = reader.read()
    const cancelling = reader.cancel(new Error('authored cancellation reason'))
    void cancelling.catch(() => {})
    expect(await pending).toEqual({ value: undefined, done: true })
    let actual: unknown
    try {
      await result.completed
    } catch (error) {
      actual = error
    }
    expect(leaves(actual)).toEqual([failure])
    await expect(cancelling).rejects.toBe(actual)
    await expect(result.dispose()).rejects.toBe(actual)
    reader.releaseLock()
    expect(owned.res.closed).toBe(true)
  })

  it('fails an unexpected response close with the same native reader error', async () => {
    const cancel = jest.fn()
    const owned = make()
    const { result } = owned.start(
      sourceResult(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes('fallback'))
          },
          cancel,
        })
      )
    )
    await result.response
    const reader = result.stream.getReader()
    await reader.read()
    const pending = reader.read().catch((error) => error)
    owned.res.destroy()
    const readError = await pending
    expect(readError).toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' })
    let actual: unknown
    try {
      await result.completed
    } catch (error) {
      actual = error
    }
    expect(actual).toBe(readError)
    expect(cancel).toHaveBeenCalledTimes(1)
    await expect(result.dispose()).rejects.toBe(actual)
    reader.releaseLock()
    expect(owned.res.closed).toBe(true)
  })

  it('joins an unread response and its pending source on early disposal', async () => {
    const cancel = jest.fn()
    const closeRequest = jest.fn(async () => {})
    const owned = make(closeRequest)
    const { result } = owned.start(
      sourceResult(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes('first unread chunk'))
            controller.enqueue(bytes('second unread chunk'))
          },
          cancel,
        })
      )
    )
    await result.response
    const reason = new Error('dispose before an authored byte consumer starts')
    await result.dispose(reason)
    expect(await result.completed).toEqual({ status: 'aborted', reason })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(closeRequest).toHaveBeenCalledTimes(1)
    expect(owned.res.closed).toBe(true)
  })

  it('joins cancellation while real owned response bytes await a queued native resume', async () => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'fixtures', 'route-stream-queued-flow.mjs'),
        require.resolve('next/dist/experimental/testing/rsc/route-stream'),
        require.resolve('next/dist/server/render-result'),
      ],
      { timeout: 10000 }
    )
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      queuedByteCancellation: true,
      sourceCancelCount: 1,
      requestCloseCount: 1,
      ownedResponseClosed: true,
    })
  })
})

describe('request-owned AppPage debug channels', () => {
  const { createRouteDebugChannelCollector } =
    require('next/dist/experimental/testing/rsc/route-debug-channel') as typeof import('next/dist/experimental/testing/rsc/route-debug-channel')
  const { PassThrough } = require('node:stream') as typeof import('node:stream')
  const native =
    require('next/dist/server/app-render/debug-channel-server.node') as typeof import('next/dist/server/app-render/debug-channel-server.node')
  const web =
    require('next/dist/server/app-render/debug-channel-server.web') as typeof import('next/dist/server/app-render/debug-channel-server.web')

  it.each(['node', 'web'] as const)(
    'retains actual %s channel bytes and IDs through successful EOF',
    async (kind) => {
      const collector = createRouteDebugChannelCollector()
      const channel =
        kind === 'node'
          ? native.createNodeDebugChannel()
          : web.createWebDebugChannel()
      collector.setReactDebugChannel(
        channel.clientSide,
        'html-owner',
        'request-owner'
      )
      const bytes = new Uint8Array([0, 255, 10, 65])
      const writer =
        kind === 'web' ? channel.serverSide.writable.getWriter() : undefined
      if (writer) await writer.write(bytes)
      else
        await new Promise<void>((resolve, reject) => {
          channel.serverSide.write(bytes, (error: Error | null) =>
            error ? reject(error) : resolve()
          )
        })
      let finished = false
      const closing = collector.close()
      void closing.then(() => {
        finished = true
      })
      await Promise.resolve()
      expect(finished).toBe(false)
      if (writer) await writer.close()
      else await new Promise<void>((resolve) => channel.serverSide.end(resolve))
      await closing
      expect(collector.close()).toBe(closing)
      expect(
        collector.captured.map(({ htmlRequestId, requestId }) => ({
          htmlRequestId,
          requestId,
        }))
      ).toEqual([{ htmlRequestId: 'html-owner', requestId: 'request-owner' }])
      expect(Buffer.concat(collector.captured[0].chunks)).toEqual(
        Buffer.from(bytes)
      )
      bytes.fill(7)
      expect(Buffer.concat(collector.captured[0].chunks)).toEqual(
        Buffer.from([0, 255, 10, 65])
      )
      writer?.releaseLock()
    }
  )

  it.each(['node', 'web'] as const)(
    'joins the actual %s producer after an incomplete response',
    async (kind) => {
      const collector = createRouteDebugChannelCollector()
      const cancel = jest.fn()
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const readable =
        kind === 'node'
          ? new PassThrough()
          : new ReadableStream<Uint8Array>({
              start: (value) => {
                controller = value
              },
              cancel,
            })
      collector.setReactDebugChannel({ readable }, 'html', 'request')
      let closed = false
      const closing = collector.close()
      expect(collector.close()).toBe(closing)
      void closing.then(() => {
        closed = true
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      if (readable instanceof PassThrough)
        readable.end(Buffer.from('late producer bytes'))
      else {
        controller.enqueue(new TextEncoder().encode('late producer bytes'))
        controller.close()
      }
      await closing
      expect(Buffer.concat(collector.captured[0].chunks).toString()).toBe(
        'late producer bytes'
      )
      expect(cancel).not.toHaveBeenCalled()
      if (readable instanceof PassThrough)
        expect(readable.readableEnded).toBe(true)
      else expect(readable.locked).toBe(false)
    }
  )

  it.each(['node', 'web'] as const)(
    'retains an independent actual %s AbortError by identity',
    async (kind) => {
      const collector = createRouteDebugChannelCollector()
      const failure = new DOMException('independent debug source', 'AbortError')
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const readable =
        kind === 'node'
          ? new PassThrough()
          : new ReadableStream<Uint8Array>({
              start: (value) => (controller = value),
            })
      collector.setReactDebugChannel({ readable }, 'html', 'request')
      if (readable instanceof PassThrough) readable.destroy(failure)
      else controller.error(failure)
      await expect(collector.close()).rejects.toBe(failure)
      if (!(readable instanceof PassThrough))
        expect(readable.locked).toBe(false)
    }
  )

  it('retains independent sibling read failures by identity and joins both producers', async () => {
    const collector = createRouteDebugChannelCollector()
    const firstFailure = new Error('actual first debug source failed')
    const secondFailure = new DOMException(
      'actual second debug source failed',
      'AbortError'
    )
    const first = new PassThrough()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const second = new ReadableStream<Uint8Array>({
      start: (value) => {
        controller = value
      },
    })
    collector.setReactDebugChannel({ readable: first }, 'html', 'first')
    collector.setReactDebugChannel({ readable: second }, 'html', 'second')
    controller.error(secondFailure)
    first.destroy(firstFailure)
    let actual: unknown
    try {
      await collector.close()
    } catch (error) {
      actual = error
    }
    expect(actual).toMatchObject({ errors: [firstFailure, secondFailure] })
    expect((actual as { errors: unknown[] }).errors[0]).toBe(firstFailure)
    expect((actual as { errors: unknown[] }).errors[1]).toBe(secondFailure)
    expect(first.destroyed).toBe(true)
    expect(second.locked).toBe(false)
    await expect(collector.close()).rejects.toBe(actual)
  })
})

describe('actual route response abort signal ownership', () => {
  const { Writable } = require('node:stream') as typeof import('node:stream')
  const { signalFromNodeResponse, ResponseAborted } =
    require('next/dist/server/web/spec-extension/adapters/next-request') as typeof import('next/dist/server/web/spec-extension/adapters/next-request')

  it.each(['finished', 'cancelled'] as const)(
    'joins the real %s response close and retains unrelated listeners',
    async (outcome) => {
      const response = new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        },
      })
      const unrelated = jest.fn()
      response.on('close', unrelated)
      const signal = signalFromNodeResponse(response)
      expect(response.listenerCount('close')).toBe(2)
      expect(signal.aborted).toBe(false)
      const closed = new Promise<void>((resolve) =>
        response.once('close', resolve)
      )
      if (outcome === 'finished') response.end()
      else response.destroy()
      await closed
      expect(signal.aborted).toBe(outcome === 'cancelled')
      if (outcome === 'cancelled')
        expect(signal.reason).toBeInstanceOf(ResponseAborted)
      expect(response.listeners('close')).toEqual([unrelated])
      expect(unrelated).toHaveBeenCalledTimes(1)
    }
  )

  it.each([false, true])(
    'preserves an already destroyed response reason (errored: %s)',
    async (errored) => {
      const response = new Writable()
      const failure = new Error('actual already errored response')
      response.on('error', () => {})
      const closed = new Promise<void>((resolve) =>
        response.once('close', resolve)
      )
      response.destroy(errored ? failure : undefined)
      const listeners = response.listenerCount('close')
      const signal = signalFromNodeResponse(response)
      expect(signal.aborted).toBe(true)
      if (errored) expect(signal.reason).toBe(failure)
      else expect(signal.reason).toBeInstanceOf(ResponseAborted)
      expect(response.listenerCount('close')).toBe(listeners)
      await closed
    }
  )
})

it('joins the actual owned Node Flight destination and preserves independent failures', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'route-debug-flight-node.cjs')],
    { cwd: process.cwd() }
  )
  const result = JSON.parse(stdout)
  expect(result.controls).toHaveLength(14)
  expect(
    result.controls.every((control: { kind: string }) => control.kind)
  ).toBe(true)
})
