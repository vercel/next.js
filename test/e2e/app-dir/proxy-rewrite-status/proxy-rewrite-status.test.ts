import { nextTestSetup } from 'e2e-utils'

describe('proxy-rewrite-status', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves the rewritten target itself as 200', async () => {
    const res = await next.fetch('/gone')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('proxy rewrite target')
  })

  it('keeps a Proxy rewrite status of 410 and serves the target body', async () => {
    const res = await next.fetch('/listing/123')
    expect(res.status).toBe(410)
    expect(await res.text()).toContain('proxy rewrite target')
  })

  it('keeps a Proxy rewrite status of 503, retry-after, and the target body', async () => {
    const res = await next.fetch('/maintenance')
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('120')
    expect(await res.text()).toContain('proxy rewrite target')
  })
})
