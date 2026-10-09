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
