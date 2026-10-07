import { nextTestSetup } from 'e2e-utils'

// The source value lives in the same process as the Route Handlers.
// @force-gate !deploy
describe('revalidateTag after returning a streaming response', () => {
  const { next } = nextTestSetup({ files: __dirname, skipDeployment: true })

  async function getValue() {
    return next.fetch('/api/value').then((response) => response.json())
  }

  it('does not invalidate the tag when revalidateTag is called inside the streamed body', async () => {
    expect(await getValue()).toEqual({ source: 1, cached: 1 })

    // Fully consume the stream, so the revalidateTag call inside of it has
    // definitely happened before we read the cached value again.
    const response = await next.fetch('/api/stream-mutate', { method: 'POST' })
    expect(await response.text()).toBe('event: start\n\nevent: revalidated\n\n')

    await new Promise((resolve) => setTimeout(resolve, 1000))

    // TODO(revalidate-tag-after-streaming-response): The tag invalidation that
    // happened after the Response was returned is silently dropped, so the
    // cached value is still the pre-mutation one. When this is fixed, `cached`
    // is expected to be `2`.
    expect(await getValue()).toEqual({ source: 2, cached: 1 })

    // The same revalidateTag call before returning the Response does invalidate
    // the tag.
    await next.fetch('/api/sync-mutate', { method: 'POST' })

    expect(await getValue()).toEqual({ source: 3, cached: 3 })
  })
})
