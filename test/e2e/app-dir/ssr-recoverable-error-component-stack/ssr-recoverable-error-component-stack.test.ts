import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Runtime server logs are only observable for a locally started server, and
// the behavior below is specific to production renders.
// @force-gate prod
// @force-gate !deploy
describe('ssr-recoverable-error-component-stack', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function countOccurrences(search: string) {
    return next.cliOutput.split(search).length - 1
  }

  it('re-invokes the throwing client component to generate a component stack for every recoverable SSR error', async () => {
    const invocationsBefore = countOccurrences('__thrower_invoked__')
    const errorsBefore = countOccurrences('recoverable-ssr-error')

    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    // The error is recoverable: the boundary falls back to client rendering.
    expect(await res.text()).toContain('fallback')

    await retry(async () => {
      expect(countOccurrences('recoverable-ssr-error')).toBe(errorsBefore + 1)
    })

    // Current behavior: the component runs twice per request. Once for the
    // render itself, and once more because `createHTMLErrorHandler` reads the
    // lazy `errorInfo.componentStack` getter to compute the error digest,
    // which makes React run component frame detection (the synchronous cost
    // reported for recoverable SSR errors). Without that read, the component
    // would only be invoked once per request.
    expect(countOccurrences('__thrower_invoked__')).toBe(invocationsBefore + 2)
  })

  it('repeats the component stack generation on every request', async () => {
    const invocationsBefore = countOccurrences('__thrower_invoked__')
    const errorsBefore = countOccurrences('recoverable-ssr-error')

    await (await next.fetch('/')).text()

    await retry(async () => {
      expect(countOccurrences('recoverable-ssr-error')).toBe(errorsBefore + 1)
    })

    // The extra invocation is not cached across requests, so the cost is paid
    // for every render that produces a recoverable error.
    expect(countOccurrences('__thrower_invoked__')).toBe(invocationsBefore + 2)
  })
})
