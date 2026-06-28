import { nextTestSetup } from 'e2e-utils'

describe('nested-empty-generate-static-params', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) return

  // Cache components requires a non-empty generateStaticParams, so this fixture
  // (which intentionally returns [] for one parent value) only applies without
  // cache components.
  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    it('skips when cache components is enabled', () => {})
    return
  }

  beforeAll(async () => {
    await next.start()
  })

  async function getPrerenderedRoutes(): Promise<string[]> {
    const manifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )
    return Object.keys(manifest.routes)
  }

  it('prerenders the child pages whose parent returned a non-empty array, even when a sibling parent returned []', async () => {
    const routes = await getPrerenderedRoutes()

    // The `en` parent returned [{ slug: 'a' }, { slug: 'b' }] and must be
    // prerendered. The `fr` parent returned [] and contributes no static
    // children — but that must NOT drop the valid `en` pages.
    expect(routes).toContain('/en/thing/a')
    expect(routes).toContain('/en/thing/b')

    // Sanity: `fr` is not prerendered (its generateStaticParams returned []).
    expect(routes).not.toContain('/fr/thing/a')
    expect(routes).not.toContain('/fr/thing/b')
  })

  it('matches the positive-control route that returns a non-empty array for every parent', async () => {
    const routes = await getPrerenderedRoutes()

    expect(routes).toContain('/en/thing-control/a')
    expect(routes).toContain('/en/thing-control/b')
    expect(routes).toContain('/fr/thing-control/a')
    expect(routes).toContain('/fr/thing-control/b')
  })

  it('serves the prerendered child page content', async () => {
    const res = await next.fetch('/en/thing/a')
    expect(res.status).toBe(200)
    // React splits adjacent text nodes with comment markers (e.g.
    // `en<!-- --> <!-- -->a`), so strip HTML comments before asserting.
    const html = (await res.text()).replace(/<!--.*?-->/g, '')
    expect(html).toContain('en a')
  })
})
