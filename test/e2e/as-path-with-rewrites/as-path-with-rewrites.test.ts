import { nextTestSetup } from 'e2e-utils'

describe('as-path-with-rewrites', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not include internal query params in `asPath`', async () => {
    const $ = await next.render$('/foo')
    expect($('h1').text()).toBe('rewrite-target: /foo')
  })
})
