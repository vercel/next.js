import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('next/dynamic in a module loaded with a plain import()', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Pages Router SSR renders the Suspense fallback of `React.lazy`, so only App Router SSR renders
  // (and preloads) the next/dynamic components. `targets` is how many times the module with the
  // next/dynamic imports is rendered.
  describe.each([
    ['App Router', '/', 'app/page', true, 1],
    [
      'App Router, two plain import()s',
      '/two-hops',
      'app/two-hops/page',
      true,
      1,
    ],
    [
      'App Router, loader reused from an outer chunk group',
      '/reused-loader',
      'app/reused-loader/page',
      true,
      2,
    ],
    [
      'App Router, plain import() of a module the layout already loads',
      '/available-outer',
      'app/available-outer/page',
      true,
      2,
    ],
    ['Pages Router', '/legacy', 'pages/legacy', false, 1],
  ])('%s', (_, pathname, manifestDir, rendersOnServer, targets) => {
    it('should only reference script chunks that exist', async () => {
      const $ = await next.render$(pathname)
      if (rendersOnServer) {
        expect($('.ssr-target')).toHaveLength(targets)
      }

      const preloadUrls = new Set<string>()
      const urls = new Set<string>()
      $('link[rel="preload"][as="script"], script[src]').each((_, el) => {
        const url = $(el).attr('href') ?? $(el).attr('src')
        if (url?.includes('/_next/static/')) {
          urls.add(url)
          if (el.tagName === 'link') {
            preloadUrls.add(url)
          }
        }
      })
      if (rendersOnServer) {
        expect(preloadUrls.size).toBeGreaterThan(0)
      }
      expect(urls.size).toBeGreaterThan(0)

      const failed: string[] = []
      for (const url of urls) {
        const res = await next.fetch(url)
        if (res.status !== 200) {
          failed.push(`${res.status} ${url}`)
        }
      }
      expect(failed).toEqual([])
    })

    // The route's loadable manifest is a local Turbopack build output.
    // @force-gate start && turbopack
    it('should only list emitted files in the loadable manifest', async () => {
      const manifest: Record<string, { files: string[] }> = JSON.parse(
        await next.readFile(
          `.next/server/${manifestDir}/react-loadable-manifest.json`
        )
      )
      const entries = Object.values(manifest)
      // One entry for each next/dynamic import in the lazily loaded module.
      expect(entries).toHaveLength(2)

      const missing: string[] = []
      for (const { files } of entries) {
        expect(files.length).toBeGreaterThan(0)
        for (const file of files) {
          if (!(await next.hasFile(`.next/${file}`))) {
            missing.push(file)
          }
        }
      }
      expect(missing).toEqual([])
    })

    it('should render and hydrate the dynamic components', async () => {
      const browser = await next.browser(pathname)
      await retry(async () => {
        const ssrTargets = await browser.elementsByCss('.ssr-target')
        const clientTargets = await browser.elementsByCss('.client-target')
        expect(ssrTargets).toHaveLength(targets)
        expect(clientTargets).toHaveLength(targets)
        for (const el of ssrTargets) {
          expect(await el.innerText()).toBe('ssr target')
        }
        for (const el of clientTargets) {
          expect(await el.innerText()).toBe('client target')
        }
      })
    })
  })
})
