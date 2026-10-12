import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Deploy mode exclusion: This suite asserts local server CLI output after
// aborting a response stream.
// @force-gate !deploy
describe('on-request-error - client-abort', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not report an aborted RSC stream but still report render errors', async () => {
    const controller = new AbortController()
    const res = await next.fetch('/hang', {
      headers: { RSC: '1' },
      signal: controller.signal,
    })
    expect(res.status).toBe(200)

    const decoder = new TextDecoder()
    for await (const rawChunk of res.body) {
      const chunk =
        typeof rawChunk === 'string' ? rawChunk : decoder.decode(rawChunk)
      // the fallback is flushed as soon as the stream opens, so nothing else
      // arrives until we abort
      if (chunk.includes('stream-started')) {
        break
      }
    }
    controller.abort()

    await next.fetch('/error')

    await retry(async () => {
      expect(next.cliOutput).toContain(
        '[instrumentation]:error server-side-error'
      )
    })
    expect(next.cliOutput).not.toContain('The destination stream closed early')
  })
})
