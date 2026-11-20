import { nextTestSetup } from 'e2e-utils'

describe('middleware-src-root', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not run middleware from the root when there is a src folder', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).not.toBe('hello world')
    expect(html).toContain('Homepage')
  })
})
