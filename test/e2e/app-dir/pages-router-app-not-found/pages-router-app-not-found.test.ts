import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// The legacy builder incorrectly replaces this response with the Pages
// Router error page. The adapter preserves the App Router not-found page.
// @force-gate !deploy || adapter
describe('pages-router-app-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('fully renders an app not-found selected by a pages route', async () => {
    const marker = `not-found-${Date.now()}`
    const res = await next.fetch(`/pages-route/${marker}`, {
      headers: {
        cookie: `not-found-marker=${marker}`,
      },
    })
    const html = await res.text()

    expect(res.status).toBe(404)
    expect(html).toContain('App Router not found')
    expect(html).toContain(marker)
  })
})
