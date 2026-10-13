import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// `_app` renders a `next/dynamic` component that shares a module with `/` (but not with `/other`).
// The component is loaded by `_app`'s own async loader on every page, so every page has to preload
// the same chunks, the ones that loader requests, regardless of what the page already loaded.
describe('pages-app-next-dynamic-preload', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const pages = ['/', '/other']

  // The `/_next/static` scripts and stylesheets (including preloads) in the SSR HTML, with their
  // query strings (e.g. the deployment id).
  async function getReferencedAssets(pathname: string) {
    const $ = await next.render$(pathname)
    const urls = $('script[src], link[href]')
      .toArray()
      .map((el) => $(el).attr('src') ?? $(el).attr('href') ?? '')
      .filter((url) => /^\/_next\/static\/.+\.(?:js|css)(?:\?|$)/.test(url))
    return [...new Set(urls)]
  }

  it.each(pages)(
    'serves every asset referenced in the HTML of %s',
    async (pathname) => {
      const assets = await getReferencedAssets(pathname)
      expect(assets.length).toBeGreaterThan(0)

      const failed: string[] = []
      for (const asset of assets) {
        const res = await next.fetch(asset)
        if (res.status !== 200) failed.push(`${res.status} ${asset}`)
      }
      expect(failed).toEqual([])
    }
  )

  it.each(pages)(
    'renders the _app next/dynamic component on %s',
    async (pathname) => {
      const browser = await next.browser(pathname)

      await retry(async () => {
        expect(await browser.elementByCss('#lazy').text()).toBe(
          'app-shared:lazy,page-shared:lazy,lazy-only-marker:lazy'
        )
      })
      expect(await browser.elementByCss('#app').text()).toBe('app-shared:app')
    }
  )

  it('preloads the same _app next/dynamic chunks on every page', async () => {
    const preloadedChunks: Record<string, string[]> = {}
    for (const pathname of pages) {
      const chunks: string[] = []
      for (const asset of await getReferencedAssets(pathname)) {
        if (!/\.js(?:\?|$)/.test(asset)) continue
        const res = await next.fetch(asset)
        expect({ asset, status: res.status }).toEqual({ asset, status: 200 })
        if ((await res.text()).includes('lazy-only-marker')) {
          chunks.push(asset.split('?')[0])
        }
      }
      preloadedChunks[pathname] = chunks.sort()
    }

    expect(preloadedChunks['/']).not.toEqual([])
    expect(preloadedChunks['/other']).toEqual(preloadedChunks['/'])
  })
})
