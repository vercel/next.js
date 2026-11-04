import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('next/dynamic in a client component shared by layout and page', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getScriptUrls(pathname: string) {
    const $ = await next.render$(pathname)
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
    return { preloadUrls: [...preloadUrls], urls: [...urls] }
  }

  it.each(['/', '/other'])(
    'should only reference script chunks that exist on %s',
    async (pathname) => {
      const { preloadUrls, urls } = await getScriptUrls(pathname)
      expect(preloadUrls.length).toBeGreaterThan(0)

      const failed: string[] = []
      for (const url of urls) {
        const res = await next.fetch(url)
        if (res.status !== 200) {
          failed.push(`${res.status} ${url}`)
        }
      }
      expect(failed).toEqual([])
    }
  )

  // The route's loadable manifest is a local Turbopack build output.
  // @force-gate start && turbopack
  it('should only list emitted files in the loadable manifest', async () => {
    const manifest: Record<string, { files: string[] }> = JSON.parse(
      await next.readFile('.next/server/app/page/react-loadable-manifest.json')
    )
    const entries = Object.values(manifest)
    // One entry for each next/dynamic import in the shared client component.
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
    const browser = await next.browser('/')
    await retry(async () => {
      const ssrTargets = await browser.elementsByCss('.ssr-target')
      const clientTargets = await browser.elementsByCss('.client-target')
      // Rendered by the layout's dynamic components, the page's static import,
      // and the page's dynamic components.
      expect(ssrTargets).toHaveLength(3)
      expect(clientTargets).toHaveLength(3)
      for (const el of ssrTargets) {
        expect(await el.innerText()).toBe('ssr target: apple')
      }
      for (const el of clientTargets) {
        expect(await el.innerText()).toBe('client target: banana')
      }
    })
  })
})
