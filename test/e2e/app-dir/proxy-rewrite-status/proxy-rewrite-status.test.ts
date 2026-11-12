import { nextTestSetup } from 'e2e-utils'

describe('proxy-rewrite-status', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('preserves the status from a proxy rewrite of a prerendered page', async () => {
    const res = await next.fetch('/listing/123')

    expect(res.status).toBe(410)
    expect(await res.text()).toContain('gone')
  })

  it('preserves the headers from a proxy rewrite of a prerendered page', async () => {
    const res = await next.fetch('/maintenance')

    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('60')
    expect(await res.text()).toContain('gone')
  })
})
