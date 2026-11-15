import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The source value and release gate live in the same process as the Route Handlers.
// @force-gate !deploy
describe('revalidateTag in after()', () => {
  const { next } = nextTestSetup({ files: __dirname, skipDeployment: true })

  async function getValue() {
    return next.fetch('/api/value').then((response) => response.json())
  }

  it('invalidates a tag again after it was refilled during the request', async () => {
    expect(await getValue()).toEqual({ source: 1, cached: 1 })

    await next.fetch('/api/trigger', { method: 'POST' })

    // The first revalidation has run. Refilling now creates an entry that the
    // second revalidation in after() must invalidate.
    expect(await getValue()).toEqual({ source: 1, cached: 1 })

    await next.fetch('/api/release', { method: 'POST' })

    await retry(async () => {
      expect(await getValue()).toEqual({ source: 2, cached: 2 })
    }, 10_000)
  })
})
