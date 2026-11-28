import { nextTestSetup } from 'e2e-utils'

describe('cache-components - redirect', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should emit refresh meta tag for redirect page without Suspense when streaming', async () => {
    if (isNextDev) {
      // In dev there is no prerendered shell, so the redirect is a
      // blocking 307 with a Location header.
      const res = await next.fetch('/redirect/no-suspense', {
        redirect: 'manual',
      })
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBe('/redirect/target')
      return
    }

    // In production the shell has already streamed, so a real 307 is no
    // longer possible. The redirect must be emitted as a meta refresh tag
    // so clients without JavaScript still navigate.
    const html = await next.render('/redirect/no-suspense')
    expect(html).toContain(
      '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/redirect/target"/>'
    )
  })
})
