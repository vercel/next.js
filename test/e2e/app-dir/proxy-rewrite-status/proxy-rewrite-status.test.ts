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

  // TODO: `next dev` renders the rewrite target on demand, and the render's
  // own 404 replaces the Proxy status that `next start` and Vercel keep.
  // @gate !dev
  it('prefers the proxy rewrite status over a 404 stored with the prerender', async () => {
    const res = await next.fetch('/removed')

    expect(res.status).toBe(410)
  })

  // TODO: as above, with the 307 from the dev render.
  // @gate !dev
  it('prefers the proxy rewrite status over a redirect stored with the prerender', async () => {
    const res = await next.fetch('/relocated', { redirect: 'manual' })

    expect(res.status).toBe(410)
  })

  it('keeps the stored status for a direct request to the rewrite target', async () => {
    const res = await next.fetch('/gone')

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('gone')
  })
})
