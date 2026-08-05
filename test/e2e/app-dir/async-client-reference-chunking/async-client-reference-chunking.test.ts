import { nextTestSetup } from 'e2e-utils'
import { getClientReferenceManifest, retry } from 'next-test-utils'

/**
 * The `src` of every chunk `<script>` in the document, as a `.next`-relative path so it can be
 * compared against the paths in `entryJSFiles`.
 */
function chunkScripts(html: string): string[] {
  return [
    ...new Set(
      Array.from(
        html.matchAll(
          /<script[^>]+src="([^"]*\/_next\/([^"]*chunks\/[^"]+))"/g
        ),
        (match) => match[2]
      )
    ),
  ]
}

describe('async-client-reference-chunking', () => {
  const { next, isTurbopack, isNextStart } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should render and hydrate the eagerly imported client component', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#eager').click()
    await retry(async () => {
      expect(await browser.elementByCss('#eager').text()).toBe('eager 1')
    })
  })

  it('should render and hydrate the lazily imported client component', async () => {
    const browser = await next.browser('/?lazy=1')
    await browser.elementByCss('#lazy').click()
    await retry(async () => {
      expect(await browser.elementByCss('#lazy').text()).toBe('lazy 1')
    })
  })

  // Webpack merges a lazily imported Client Component into the chunks of the Server Component
  // that imports it, so it is always shipped. Turbopack chunks it separately.
  //
  // Only asserted for `next start`: dev also chunks the component separately, but doesn't
  // preinit client reference chunks as `<script>` tags during SSR, so there the difference only
  // shows up in the Flight payload.
  if (isTurbopack && isNextStart) {
    it('should only load the lazily imported client component when it is rendered', async () => {
      const withoutLazy = chunkScripts(await next.render('/'))
      const withLazy = chunkScripts(await next.render('/', { lazy: '1' }))

      expect(withoutLazy.length).toBeGreaterThan(0)

      // Rendering the lazy branch pulls in chunks the page does not load otherwise...
      const lazyOnly = withLazy.filter((src) => !withoutLazy.includes(src))
      expect(lazyOnly.length).toBeGreaterThan(0)

      // ...and nothing the page loads eagerly disappears when the branch renders.
      expect(withoutLazy.filter((src) => !withLazy.includes(src))).toEqual([])
    })

    it('should keep the lazily imported client component out of entryJSFiles', async () => {
      // `entryJSFiles` is emitted as eager `<script>` tags for a layout segment, so a client
      // reference only reachable through an async import must not appear in it.
      const withoutLazy = chunkScripts(await next.render('/'))
      const withLazy = chunkScripts(await next.render('/', { lazy: '1' }))
      const lazyOnly = withLazy.filter((src) => !withoutLazy.includes(src))
      expect(lazyOnly.length).toBeGreaterThan(0)

      const manifest = getClientReferenceManifest(next, '/page')
      const entryJsFiles = Object.values(
        manifest.entryJSFiles as unknown as Record<string, string[]>
      ).flat()
      expect(entryJsFiles.length).toBeGreaterThan(0)

      for (const src of lazyOnly) {
        expect(entryJsFiles).not.toContain(src)
      }
    })
  }
})
