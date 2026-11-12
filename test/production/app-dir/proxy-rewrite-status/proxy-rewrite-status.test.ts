import { nextTestSetup } from 'e2e-utils'

describe('proxy-rewrite-status', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('serves the prerendered page with a 200 status when it is requested directly', async () => {
    const response = await next.fetch('/gone')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Gone')
  })

  it('keeps the status of a proxy rewrite to a prerendered page', async () => {
    const response = await next.fetch('/listing/123')
    expect(response.status).toBe(410)
    expect(await response.text()).toContain('Gone')
  })

  it('keeps the status and headers of a proxy rewrite together', async () => {
    const response = await next.fetch('/maintenance')
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(await response.text()).toContain('Gone')
  })

  it('keeps the status of a proxy rewrite for an RSC request', async () => {
    const response = await next.fetch('/listing/123', {
      headers: { RSC: '1' },
    })
    expect(response.status).toBe(410)
  })

  it('lets a real status stored with the prerender win over the rewrite status', async () => {
    const response = await next.fetch('/removed')
    expect(response.status).toBe(404)
  })
})
