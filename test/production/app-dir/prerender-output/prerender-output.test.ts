import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { load } from 'cheerio'
import type * as Playwright from 'playwright'

describe('prerender-output', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS: './cache-entry-handlers.js',
    },
  })

  async function restartWithState(slug: string, state: string, stale = true) {
    // Restart clears cached function results from memory and retains the disk
    // ISR entry. The foreground render can reuse its cached data while the
    // background prerender reads the updated state.
    await next.stop()
    await next.patchFile('states.json', JSON.stringify({ [slug]: state }))
    if (stale) {
      await next.patchFile(slug + '.stale', '')
    }
    await next.start({ skipBuild: true })
  }

  function fetchPage(pathname: string, testCase?: string) {
    return next.fetch(pathname, {
      redirect: 'manual',
      headers: {
        ...(testCase ? { 'x-prerender-output-case': testCase } : {}),
      },
    })
  }

  it.each([
    { pathname: '/does-not-exist', testCase: 'default-not-found', status: 404 },
    { pathname: '/500', testCase: 'error-page', status: 500 },
  ])(
    'preserves the $status status when its prerender is missing',
    async ({ pathname, testCase, status }) => {
      await next.patchFile(testCase + '.miss', '')
      const response = await fetchPage(pathname, testCase)
      expect(response.status).toBe(status)
      const $ = load(await response.text())
      expect(
        $('meta[name="robots"][content="noindex"]').length
      ).toBeGreaterThan(0)
      expect((await next.readJSON(testCase + '.stored.json')).status).toBe(
        status
      )
    }
  )

  it('caches background output independently of the stale response status', async () => {
    const slug = 'changing'
    const path = '/prerender-output/static/' + slug
    const initial = await fetchPage(path)
    expect(initial.status).toBe(200)
    await initial.text()

    for (const [state, status] of [
      ['not-found', 404],
      ['content', 200],
      ['/redirect-target', 308],
      ['content', 200],
    ] as const) {
      await restartWithState(slug, state)
      const stale = await fetchPage(path, slug)
      await stale.text()
      await retry(async () => {
        const stored = await next.readJSON(slug + '.stored.json')
        expect(stored.status ?? 200).toBe(status)
        expect(stored.headers?.location).toBe(
          status === 308 ? state : undefined
        )
      })
      const cached = await fetchPage(path)
      expect(cached.status).toBe(status)
      expect(cached.headers.get('location')).toBe(status === 308 ? state : null)
      const html = await cached.text()
      if (state === 'content') {
        const $ = load(html)
        expect($('meta[name="robots"][content="noindex"]').length).toBe(0)
      }
      await next.deleteFile(slug + '.stored.json')
    }
  })

  it('does not cache the 304 status of a conditional stale response', async () => {
    const slug = 'conditional'
    const path = '/prerender-output/static/' + slug
    const initial = await fetchPage(path)
    expect(initial.headers.get('etag')).not.toBeNull()
    await initial.text()
    await restartWithState(slug, 'content')
    // An explicit cache mode prevents fetch from adding Cache-Control: no-cache
    // to the conditional request.
    const conditional = await next.fetch(path, {
      cache: 'force-cache',
      headers: {
        'if-none-match': '*',
        'x-prerender-output-case': slug,
      },
    })
    expect(conditional.status).toBe(304)
    await retry(async () => {
      const stored = await next.readJSON(slug + '.stored.json')
      expect(stored.status ?? 200).toBe(200)
    })
    expect((await fetchPage(path)).status).toBe(200)
  })

  it('keeps a background redirect out of Flight before its headers commit', async () => {
    const path = '/prerender-output/partial/background'
    const initial = await fetchPage(path)
    await initial.text()
    await restartWithState('background', '/redirect-target')

    const responses: Playwright.Response[] = []
    const browser = await next.browser('/', {
      async beforePageLoad(page: Playwright.Page) {
        page.on('response', (response) => {
          const request = response.request()
          if (
            new URL(request.url()).pathname === path &&
            request.headers().rsc === '1'
          ) {
            responses.push(response)
          }
        })
        await page.setExtraHTTPHeaders({
          'x-prerender-output-case': 'background',
        })
      },
    })
    try {
      await browser.eval('window.__beforeNavigation = true')
      await browser.elementById('target').click()
      await retry(async () => {
        expect(responses.length).toBeGreaterThan(0)
      })
      for (const response of responses) {
        expect(response.status()).toBe(200)
        expect(response.headers().location).toBeUndefined()
        expect(response.headers()['x-observed-status']).toBe('200')
        expect(response.headers()['x-observed-headers-sent']).toBe('false')
      }
      expect(await browser.elementById('dynamic').text()).toBe(
        'Dynamic content'
      )
      expect(await browser.eval('window.__beforeNavigation')).toBe(true)
      const stored = await next.readJSON('background.stored.json')
      expect(stored.status).toBe(308)
      expect(stored.headers.location).toBe('/redirect-target')
      expect((await fetchPage(path)).status).toBe(308)
    } finally {
      await browser.close()
    }
  })

  it('sets the selected document status before a callback handles delivery', async () => {
    const path = '/prerender-output/static/callback'
    await restartWithState('callback', '/callback-target', false)
    const response = await fetchPage(path)
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('/callback-target')
    expect(response.headers.get('x-callback-status')).toBe('308')
    await response.text()
  })
})
