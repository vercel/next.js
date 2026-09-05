/**
 * @jest-environment node
 */
import { cloneResponse, cancelUnconsumedBodyOnAbort } from './clone-response'

// Drain microtasks/macrotasks so a Web Streams `cancel()` settles. This waits on
// stream-internal tasks, not application state — there is no condition to poll,
// so a fixed drain (rather than a `retry()`-style wait) is the right tool here.
async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function streamedResponse(text: string) {
  const bytes = new TextEncoder().encode(text)
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
    { status: 200, statusText: 'OK', headers: { 'x-test': '1' } }
  )
}

// A cancelled stream yields `{ done: true }` with no data on the first read.
async function firstReadDone(body: ReadableStream | null) {
  if (!body) return true
  const reader = body.getReader()
  const { done } = await reader.read()
  reader.releaseLock()
  return done
}

describe('cloneResponse', () => {
  it('returns the same response twice when there is no body', () => {
    const original = new Response(null, { status: 204 })
    const [cloned1, cloned2] = cloneResponse(original)
    expect(cloned1).toBe(original)
    expect(cloned2).toBe(original)
  })

  it('produces two independently readable clones', async () => {
    const [cloned1, cloned2] = cloneResponse(new Response('hello'))
    expect(await cloned1.text()).toBe('hello')
    expect(await cloned2.text()).toBe('hello')
  })

  it('preserves status, statusText and headers on both clones', () => {
    const [cloned1, cloned2] = cloneResponse(
      new Response('x', {
        status: 201,
        statusText: 'Created',
        headers: { 'x-test': 'yes' },
      })
    )
    for (const clone of [cloned1, cloned2]) {
      expect(clone.status).toBe(201)
      expect(clone.statusText).toBe('Created')
      expect(clone.headers.get('x-test')).toBe('yes')
    }
  })
})

describe('cancelUnconsumedBodyOnAbort', () => {
  // Regression test for https://github.com/vercel/next.js/issues/92287: a
  // retained, un-read clone must be released when the render aborts, instead of
  // being held off-heap until the FinalizationRegistry happens to run.
  it('cancels a retained, un-read body when the signal aborts', async () => {
    const controller = new AbortController()
    const [, retained] = cloneResponse(streamedResponse('leak'))
    cancelUnconsumedBodyOnAbort(controller.signal, retained.body)

    controller.abort()
    await flush()

    expect(await firstReadDone(retained.body)).toBe(true)
  })

  // Models the real leak ordering: the cache side drains the sibling clone
  // (which fills the retained clone's tee buffer), then the render aborts.
  it('releases a retained body whose sibling was already drained', async () => {
    const controller = new AbortController()
    const [consumed, retained] = cloneResponse(streamedResponse('leak-body'))
    cancelUnconsumedBodyOnAbort(controller.signal, retained.body)

    expect(await consumed.text()).toBe('leak-body')
    expect(retained.body!.locked).toBe(false)

    controller.abort()
    await flush()

    expect(await firstReadDone(retained.body)).toBe(true)
  })

  it('does nothing without a signal', async () => {
    const [, retained] = cloneResponse(streamedResponse('keep'))
    cancelUnconsumedBodyOnAbort(null, retained.body)
    cancelUnconsumedBodyOnAbort(undefined, retained.body)
    await flush()
    expect(await retained.text()).toBe('keep')
  })

  it('does nothing for a null body', () => {
    const controller = new AbortController()
    expect(() =>
      cancelUnconsumedBodyOnAbort(controller.signal, null)
    ).not.toThrow()
    controller.abort()
  })

  it('does not interrupt a body that is being read (locked)', async () => {
    const controller = new AbortController()
    const [, retained] = cloneResponse(streamedResponse('reading'))
    const reader = retained.body!.getReader()
    cancelUnconsumedBodyOnAbort(controller.signal, retained.body)

    controller.abort()
    await flush()

    // Locked -> not cancelled; the in-flight read still yields the data.
    const { value } = await reader.read()
    expect(new TextDecoder().decode(value)).toBe('reading')
    reader.releaseLock()
  })

  it('cancels on a later microtask when the signal is already aborted', async () => {
    const [, retained] = cloneResponse(streamedResponse('gone'))
    cancelUnconsumedBodyOnAbort(AbortSignal.abort(), retained.body)
    await flush()
    expect(await firstReadDone(retained.body)).toBe(true)
  })

  it('attaches a single abort listener per signal across many registrations', async () => {
    const controller = new AbortController()
    let abortListeners = 0
    const original = controller.signal.addEventListener.bind(controller.signal)
    controller.signal.addEventListener = ((type: string, ...rest: any[]) => {
      if (type === 'abort') abortListeners++
      return (original as (...args: any[]) => void)(type, ...rest)
    }) as typeof controller.signal.addEventListener

    const bodies: Array<ReadableStream | null> = []
    for (let i = 0; i < 10; i++) {
      const [, retained] = cloneResponse(streamedResponse('x'))
      bodies.push(retained.body)
      cancelUnconsumedBodyOnAbort(controller.signal, retained.body)
    }
    expect(abortListeners).toBe(1)

    controller.abort()
    await flush()
    for (const body of bodies) {
      expect(await firstReadDone(body)).toBe(true)
    }
  })

  it('leaves the consumer clone fully readable after the retained clone is cancelled', async () => {
    const controller = new AbortController()
    // Register only the retained (second) clone, exactly as the dedupe cache
    // does — the first clone is handed to the caller and must stay intact.
    const [consumer, retained] = cloneResponse(
      streamedResponse('consumer-keeps-this')
    )
    cancelUnconsumedBodyOnAbort(controller.signal, retained.body)

    controller.abort()
    await flush()

    expect(await firstReadDone(retained.body)).toBe(true)
    expect(await consumer.text()).toBe('consumer-keeps-this')
  })
})
