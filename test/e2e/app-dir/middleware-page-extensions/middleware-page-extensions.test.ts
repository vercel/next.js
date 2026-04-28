import { nextTestSetup } from 'e2e-utils'

describe('middleware-page-extensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should execute middleware.page.ts and set custom header', async () => {
    const res = await next.fetch('/headers')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('hello-from-middleware')
  })

  it('should render the page through the middleware', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('hello from middleware-page-extensions')
  })
})
