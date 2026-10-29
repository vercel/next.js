import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// assetPrefix.mdx: SSR and SSG navigation data remains on the application
// domain even when JavaScript/CSS is loaded from a different CDN origin.
// Localhost and 127.0.0.1 model those distinct origins on a single listener.
// @force-gate !deploy
describe('documented Pages data origin with assetPrefix', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    forcedPort: 'random',
  })

  function getAssetOrigin() {
    return `http://127.0.0.1:${next.forcedPort}`
  }

  beforeAll(async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
      cacheComponents: false,
      experimental: { cachedNavigations: false },
      assetPrefix: '${getAssetOrigin()}',
      async headers() {
        return [{ source: '/:path*', headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' }
        ] }]
      }
    }`
    )
    await next.start()
  })

  it('[R22/R32] loads emitted assets at the CDN origin while public files keep their ordinary path', async () => {
    const assetOrigin = getAssetOrigin()
    expect(new URL(next.url).origin).not.toBe(assetOrigin)
    const $ = await next.render$('/')
    const scripts = $('script[src]')
      .toArray()
      .map((element) => $(element).attr('src')!)
      .filter(
        (src) => src.includes('/_next/static/') && src.includes('/chunks/')
      )
    const styles = $('link[rel="stylesheet"][href]')
      .toArray()
      .map((element) => $(element).attr('href')!)
    expect(scripts.length).toBeGreaterThan(0)
    if (!isNextDev) expect(styles.length).toBeGreaterThan(0)
    for (const src of [...scripts, ...styles]) {
      const url = new URL(src)
      expect(url.origin).toBe(assetOrigin)
      const response = await fetch(url)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toMatch(
        /javascript|text\/css/
      )
    }
    expect($('#public-link').attr('href')).toBe('/manual.txt')
    const response = await next.fetch('/manual.txt')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Public manual')
  })

  for (const [kind, marker] of [
    ['ssr', 'SSR destination'],
    ['ssg', 'SSG destination'],
  ]) {
    it(`[R22] keeps ${kind} client navigation data on the application origin`, async () => {
      const assetOrigin = getAssetOrigin()
      expect(new URL(next.url).origin).not.toBe(assetOrigin)
      const requests: URL[] = []
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          page.on('request', (request) => {
            const url = new URL(request.url())
            if (url.pathname.startsWith('/_next/data/')) requests.push(url)
          })
        },
      })
      await browser.eval('window.__dataOriginMarker = "retained"')
      await browser.elementByCss(`#${kind}-link`).click()
      await retry(async () => {
        expect(await browser.elementByCss('#destination').text()).toBe(marker)
        expect(new URL(await browser.url()).pathname).toBe(`/${kind}`)
      })
      expect(await browser.eval('window.__dataOriginMarker')).toBe('retained')
      expect(requests.length).toBeGreaterThan(0)
      for (const url of requests) {
        expect(url.origin).toBe(new URL(next.url).origin)
        expect(url.origin).not.toBe(assetOrigin)
        expect(url.pathname).toBe(`/_next/data/${next.buildId}/${kind}.json`)
        expect(url.searchParams.get('tag')).toBe(
          kind === 'ssr' ? 'server' : 'static'
        )
      }
      if (kind === 'ssr') {
        expect(await browser.elementByCss('#resolved-url').text()).toBe(
          '/ssr?tag=server'
        )
      }
      await retry(async () => {
        expect(
          await browser.eval(
            'getComputedStyle(document.documentElement).getPropertyValue("--asset-prefix-contract").trim()'
          )
        ).toBe('loaded')
      })
    })
  }
})
