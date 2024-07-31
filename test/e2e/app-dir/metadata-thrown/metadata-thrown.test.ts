import { nextTestSetup } from 'e2e-utils'

describe('app dir - metadata thrown', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // TODO(@panteliselef): Handle 403 as well
  it('should not crash from error thrown during preloading nested generateMetadata', async () => {
    const res = await next.fetch('/dynamic-meta')
    expect(res.status).toBe(404)
  })
})
