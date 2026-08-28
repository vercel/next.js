import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - boundary (loading/template/error) chunk CSP nonce', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('emits the request nonce on every SSR-rendered chunk <script>', async () => {
    // Full page load (not a client navigation): React streams the loading.js
    // fallback - and with it the segment's boundary entry <script> - into the
    // initial HTML, where it is parser-inserted and `'strict-dynamic'` cannot
    // vouch for it unless it carries the request nonce.
    //
    // The boundary entry <script> is only rendered when the segment owns a
    // client chunk that is not also a rendered client reference (a
    // side-effect-only "use client" import - see app/boundary/loading-effects.js)
    // and only the Turbopack build lists such chunks (`entryJSFiles` in the
    // client reference manifest); the webpack build has no `entryJSFiles`, so
    // there this only exercises the framework bootstrap scripts.
    const $ = await next.render$('/boundary')

    const chunkScripts = $('script[src]').filter((_, el) =>
      /\/_next\/static\/(immutable\/)?chunks\//.test($(el).attr('src') || '')
    )

    expect(chunkScripts.length).toBeGreaterThan(0)

    const unnonced = chunkScripts
      .toArray()
      .filter((el) => $(el).attr('nonce') !== 'boundary-nonce-test')
      .map((el) => $(el).attr('src'))

    expect(unnonced).toEqual([])
  })

  it('renders and hydrates the boundary under a strict nonce CSP', async () => {
    const browser = await next.browser('/boundary')

    await browser.waitForElementByCss('#page')

    // Client runtime booted under the nonce CSP.
    await retry(async () => {
      await browser.elementByCss('#counter').click()
      expect(await browser.elementByCss('#counter').text()).toBe(
        'clicked 1 times'
      )
    })

    if (global.browserName === 'chrome' && !isNextDev) {
      const logs = await browser.log()
      const cspViolations = logs.filter(
        (log) =>
          log.source === 'security' &&
          log.message.includes('Content Security Policy')
      )
      expect(cspViolations).toEqual([])
    }
  })
})
