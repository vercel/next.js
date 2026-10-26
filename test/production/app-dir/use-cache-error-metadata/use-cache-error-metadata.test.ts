import { nextTestSetup } from 'e2e-utils'

describe('use-cache-error-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should finish the error document when a failing "use cache" function is also read by generateMetadata', async () => {
    const res = await next.fetch('/items/1', {
      // Without a bound, a response that never finishes would only fail on the
      // test timeout.
      signal: AbortSignal.timeout(10_000),
    })
    const html = await res.text()

    expect(html).toContain('id="__next_error__"')
    expect(html).toEndWith('</html>')
  })
})
