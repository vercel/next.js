import { nextTestSetup } from 'e2e-utils'

describe('pages-405-method-app-gip', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should allow POST when a custom _app defines getInitialProps', async () => {
    // A custom `_app.tsx` with getInitialProps opts every page in the app
    // out of static auto-export, so plain pages must still accept non-GET
    // methods because the app-level resolver may inspect `req.method`.
    const res = await next.fetch('/', { method: 'POST' })
    expect(res.status).not.toBe(405)
  })

  it('should serve GET normally', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    // The custom _app's getInitialProps runs on every request and forwards
    // the method into pageProps; assert via __NEXT_DATA__ since React splits
    // adjacent static/dynamic text with a comment marker in the rendered HTML.
    expect(html).toContain('"method":"GET"')
  })
})
