/**
 * @jest-environment node
 */
import { cloneResponse } from './clone-response'

// Flush enough microtasks/macrotasks for ReadableStream cancellation to settle.
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
    const original = new Response('x', {
      status: 201,
      statusText: 'Created',
      headers: { 'x-test': 'yes' },
    })
    const [cloned1, cloned2] = cloneResponse(original)
    for (const clone of [cloned1, cloned2]) {
      expect(clone.status).toBe(201)
      expect(clone.statusText).toBe('Created')
      expect(clone.headers.get('x-test')).toBe('yes')
    }
  })

  it('does not cancel anything when no signal is provided', async () => {
    const [cloned1, cloned2] = cloneResponse(streamedResponse('keep'))
    await flush()
    expect(await cloned1.text()).toBe('keep')
    expect(await cloned2.text()).toBe('keep')
  })

  // Regression test for https://github.com/vercel/next.js/issues/92287:
  // an un-consumed `cloned2` retained past the render must be released
  // deterministically when the render's abort signal fires, instead of being
  // held (off-heap) until the FinalizationRegistry happens to run.
  it('cancels the retained clone (cloned2) when the signal aborts', async () => {
    const controller = new AbortController()
    const [, cloned2] = cloneResponse(
      streamedResponse('leak'),
      controller.signal
    )

    controller.abort()
    await flush()

    // cloned2 was cancelled; its buffered body is gone.
    await expect(cloned2.text()).rejects.toThrow()
  })

  // Models the real leak ordering: the cache side drains cloned1 (which fills
  // cloned2's tee buffer with the whole body), cloned2 is retained un-read, and
  // the render then aborts — cloned2 must be released.
  it('releases a retained cloned2 whose sibling was already drained', async () => {
    const controller = new AbortController()
    const [cloned1, cloned2] = cloneResponse(
      streamedResponse('leak-body'),
      controller.signal
    )

    expect(await cloned1.text()).toBe('leak-body')
    expect(cloned2.body!.locked).toBe(false)

    controller.abort()
    await flush()

    await expect(cloned2.text()).rejects.toThrow()
  })

  // Guards against the regression where cancelling on abort would tear down the
  // clone the framework still needs to read (the body drained into the cache /
  // returned to the patched fetcher), which surfaced as
  // "TypeError: Body is unusable".
  it('never cancels cloned1, even when the signal aborts first', async () => {
    const controller = new AbortController()
    const [cloned1] = cloneResponse(
      streamedResponse('cache-me'),
      controller.signal
    )

    controller.abort()
    await flush()

    // cloned1 is the framework-consumed branch and must remain fully readable.
    expect(await cloned1.text()).toBe('cache-me')
  })

  it('leaves cloned1 readable when given an already-aborted signal and read later', async () => {
    const [cloned1] = cloneResponse(
      streamedResponse('still-here'),
      AbortSignal.abort()
    )
    // Consume in a later microtask, mimicking the dedupe -> patched-fetcher gap.
    await Promise.resolve()
    await Promise.resolve()
    expect(await cloned1.text()).toBe('still-here')
  })

  it('does not interrupt cloned2 while it is actively being read', async () => {
    const controller = new AbortController()
    const [, cloned2] = cloneResponse(
      streamedResponse('reading'),
      controller.signal
    )

    // Start reading cloned2 (locks the body), then abort mid-flight.
    const pending = cloned2.text()
    controller.abort()

    expect(await pending).toBe('reading')
  })
})
