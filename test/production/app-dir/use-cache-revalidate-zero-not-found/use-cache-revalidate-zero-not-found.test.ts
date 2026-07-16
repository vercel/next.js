import { nextTestSetup } from 'e2e-utils'

describe('use-cache-revalidate-zero-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('returns 404 without logging an invalid revalidate error for a blocking PPR fallback', async () => {
    const outputIndex = next.cliOutput.length
    const response = await next.fetch('/missing')

    expect(response.status).toBe(404)
    expect(next.cliOutput.slice(outputIndex)).not.toContain(
      'Invalid revalidate configuration provided: 0 < 1'
    )
  })
})
