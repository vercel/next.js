import { nextTestSetup } from 'e2e-utils'

describe('ecmascript-features', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // In case you need to test the response object
  it('should work with fetch', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('hello world')
  })
})
