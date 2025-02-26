import { nextTestSetup } from 'e2e-utils'

describe('as-path-with-rewrites', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not include internal query params in `asPath` and `req.url`', async () => {
    const $ = await next.render$('/foo')
    expect($('#as-path').text()).toBe('/foo')
    expect($('#req-url').text()).toBe('/foo')
  })
})
