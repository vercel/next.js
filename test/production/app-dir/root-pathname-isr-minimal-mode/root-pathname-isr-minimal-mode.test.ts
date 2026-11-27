import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { withInvocationId } from 'next-test-utils'

describe('root pathname during minimal-mode ISR', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      // Reproduce the platform's minimal-mode request path locally.
      NEXT_PRIVATE_MINIMAL_MODE: '1',
      // Keep x-matched-path from being stripped as an external-only header.
      NEXT_PRIVATE_TEST_HEADERS: '1',
    },
  })

  it('keeps the root pathname when ISR is invoked through /index', async () => {
    const initial$ = await next.render$('/')
    expect(initial$('#pathname').text()).toBe('/')

    // The platform invokes root ISR through its internal `/index` path while
    // `x-matched-path` identifies the public route as `/`. Minimal-mode
    // responses are scoped by invocation, so this generates a fresh response.
    const invocation = withInvocationId({
      redirect: 'manual',
      headers: {
        'x-matched-path': '/',
      },
    })
    const response = await next.fetch('/index', invocation)
    const regeneratedHtml = await response.text()
    const regenerated$ = cheerio.load(regeneratedHtml)

    // Reuse the invocation so `/` hydrates the response generated through
    // `/index`, matching how the platform serves the regenerated entry.
    const browser = await next.browser('/', {
      pushErrorAsConsoleLog: true,
      extraHTTPHeaders: {
        'x-invocation-id': (invocation.headers as Record<string, string>)[
          'x-invocation-id'
        ],
      },
    })
    const browserLogs = await browser.log()

    expect(response.status).toBe(200)
    expect(regenerated$('#page').text()).toBe('hello world')
    expect(browserLogs).not.toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining('Minified React error #418'),
      })
    )
    expect(regenerated$('#pathname').text()).toBe('/')
  })

  // A real user rewrite can produce the same root route and `/index` request
  // shape as the platform's internal alias. Only the internal alias should be
  // normalized; the rewrite must retain its browser-visible source pathname.
  it('keeps the source pathname when /index is rewritten to the root', async () => {
    const invocation = withInvocationId({
      headers: {
        'x-test-index-rewrite': '1',
      },
    })
    const response = await next.fetch('/index', invocation)
    const html = await response.text()
    const $ = cheerio.load(html)

    expect(response.status).toBe(200)
    expect($('#page').text()).toBe('hello world')
    expect($('#pathname').text()).toBe('/index')
  })
})
