import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'

describe('require-cache-retention', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('observes the invalidated server module after HMR', async () => {
    const initial = await (await next.fetch('/api/probe')).json()
    expect(initial).toEqual({ version: 1, cached: true, retained: true })

    await next.patchFile('pages/api/probe.js', (content) =>
      content.replace('version: 1', 'version: 2')
    )

    const updated = await retry(async () => {
      const response = await (await next.fetch('/api/probe')).json()
      expect(response.version).toBe(2)
      expect(response.cached).toBe(false)
      return response
    })

    if (
      Number.parseInt(process.versions.node, 10) <= 20 &&
      (await gate((conditions) => !conditions.turbopack))
    ) {
      expect(updated.retained).toBe(false)
    } else {
      // FIXME: The invalidated module should be collected after HMR.
      expect(updated.retained).toBe(true)
    }
  })
})
