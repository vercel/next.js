import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isNodeMiddleware = process.env.TEST_NODE_MIDDLEWARE === 'true'

describe(`app-dir - draft-mode-middleware (${
  isNodeMiddleware ? 'nodejs' : 'edge'
} runtime)`, () => {
  const { next, skipped } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      'middleware-edge.ts': new FileRef(join(__dirname, 'middleware-edge.ts')),
      'middleware.ts': new FileRef(
        join(
          __dirname,
          isNodeMiddleware ? 'middleware-node.ts' : 'middleware-edge.ts'
        )
      ),
    },
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should be able to enable draft mode with middleware present', async () => {
    const browser = await next.browser(
      '/api/draft?secret=secret-token&slug=preview-page'
    )

    await retry(async () => {
      expect(next.cliOutput).toContain(
        'draftMode().isEnabled from middleware: true'
      )
    })

    await browser.loadPage(new URL('/preview-page', next.url).toString())
    const draftText = await browser.elementByCss('h1').text()
    expect(draftText).toBe('draft')
  })

  it('should be able to disable draft mode with middleware present', async () => {
    const browser = await next.browser('/api/disable-draft')
    await retry(async () => {
      expect(next.cliOutput).toContain(
        'draftMode().isEnabled from middleware: false'
      )
    })

    await browser.loadPage(new URL('/preview-page', next.url).toString())
    const draftText = await browser.elementByCss('h1').text()
    expect(draftText).toBe('none')
  })

  it('should report accurate draft mode status from middleware in response headers', async () => {
    // Without the bypass cookie, draft mode is reported as disabled.
    const disabledRes = await next.fetch('/preview-page')
    expect(disabledRes.status).toBe(200)
    expect(disabledRes.headers.get('x-draft-mode')).toBe('disabled')

    // Enable draft mode through the route handler to receive the bypass
    // cookie.
    const draftRes = await next.fetch(
      '/api/draft?secret=secret-token&slug=preview-page',
      { redirect: 'manual' }
    )
    const bypassCookie = draftRes.headers
      .get('set-cookie')
      ?.match(/__prerender_bypass=[^;]+/)?.[0]
    expect(bypassCookie).toBeTruthy()

    // With the bypass cookie, middleware reports draft mode as enabled.
    const enabledRes = await next.fetch('/preview-page', {
      headers: { cookie: bypassCookie! },
    })
    expect(enabledRes.status).toBe(200)
    expect(enabledRes.headers.get('x-draft-mode')).toBe('enabled')
  })

  it('should be able to enable draft mode from middleware', async () => {
    const res = await next.fetch('/preview-page?draft=true')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-draft-mode')).toBe('enabled')

    const bypassCookie = res.headers
      .get('set-cookie')
      ?.match(/__prerender_bypass=[^;]+/)?.[0]
    expect(bypassCookie).toBeTruthy()

    // A subsequent request with the bypass cookie renders draft content.
    const draftPageRes = await next.fetch('/preview-page', {
      headers: { cookie: bypassCookie! },
    })
    expect(await draftPageRes.text()).toContain('draft')
  })
})
