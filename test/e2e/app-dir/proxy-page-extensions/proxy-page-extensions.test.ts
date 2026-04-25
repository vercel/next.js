import { nextTestSetup } from 'e2e-utils'

describe('proxy-page-extensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should execute proxy.page.ts and set custom header', async () => {
    const res = await next.fetch('/headers')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('hello-from-proxy')
  })

  it('should render the page through the proxy', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('hello from proxy-page-extensions')
  })
})
