import { nextTestSetup } from 'e2e-utils'

describe('many-promises', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle many awaited promises in a Server Component render function', async () => {
    const res = await next.fetch('/server-render')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('done')
  })

  it('should handle many awaited promises in a Top Level Await module imported by a Server Component', async () => {
    const res = await next.fetch('/server-tla')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('done')
  })

  it('should handle many awaited promises in a Client Component with Top Level Await during SSR', async () => {
    const res = await next.fetch('/client-tla-ssr')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('done')
  })

  it('should handle many awaited promises in a Client Component with Top Level Await on the client', async () => {
    const res = await next.fetch('/client-tla-client')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('done')
  })
})
