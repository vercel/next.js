import { nextTestSetup } from 'e2e-utils'

describe('Edge runtime pages-api route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work edge runtime', async () => {
    const res = await next.fetch('/api/edge')
    const text = await res.text()
    expect(text).toContain('All Good')
  })

  it('should work with node runtime', async () => {
    const res = await next.fetch('/api/node')
    const text = await res.text()
    expect(text).toContain('All Good')
  })
})
