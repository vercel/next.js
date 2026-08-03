import { nextTestSetup } from 'e2e-utils'

const isAdapterTest = process.env.NEXT_ENABLE_ADAPTER === '1'

describe('pages-router-app-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // The legacy builder incorrectly replaces this response with the Pages
    // Router error page. The adapter preserves the App Router not-found page.
    skipDeployment: !isAdapterTest,
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
