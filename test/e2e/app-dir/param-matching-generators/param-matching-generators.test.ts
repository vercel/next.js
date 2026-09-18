import { nextTestSetup } from 'e2e-utils'
import type { PrerenderManifest } from 'next/dist/build'
import type {
  FlightRouterState,
  PrefetchHints,
} from 'next/dist/shared/lib/app-router-types'

describe('param-matching-generators', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  async function getClosedSegments(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    // Reconstruct the regression if this private representation changes;
    // do not preserve or expose router internals just for this assertion.
    return browser.eval(() => {
      const closedSegments: string[] = []
      function visit(tree: FlightRouterState) {
        // PrefetchHint.IsClosedParam is a const enum bit.
        if (((tree[4] ?? 0) & 0b1000000000000000) !== 0) {
          const segment = tree[0]
          closedSegments.push(
            typeof segment === 'string' ? segment : `[${segment[0]}]`
          )
        }
        for (const child of Object.values(tree[1])) visit(child)
      }
      visit(window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE.tree)
      return closedSegments
    })
  }

  it('allows public cached configuration in a matching generator', async () => {
    for (const slug of ['first', 'novel']) {
      const $ = await next.render$(`/cached/${slug}`)
      expect($('#cached-matcher').text()).toBe(`Cached matcher: ${slug}`)
    }
  })

  it.each(['document', 'navigation'])(
    'advertises closed parameters for an allowed %s, including in dev',
    async (requestKind) => {
      const browser = await next.browser(
        requestKind === 'document' ? '/closed/allowed' : '/'
      )
      if (requestKind === 'navigation') {
        await browser.elementByCss('a[href="/closed/allowed"]').click()
      }
      expect(await browser.elementById('closed-page').text()).toBe(
        'Allowed page'
      )
      expect(await getClosedSegments(browser)).toEqual(['[slug]'])
      await browser.close()
    }
  )

  it('does not mark open routes as closed', async () => {
    const browser = await next.browser('/')
    expect(await getClosedSegments(browser)).toEqual([])
    await browser.close()
  })

  it.each(['document', 'navigation'])(
    'marks only the closed prefix for a %s to a mixed-policy route',
    async (requestKind) => {
      const browser = await next.browser(
        requestKind === 'document' ? '/mixed/en/allowed' : '/'
      )
      if (requestKind === 'navigation') {
        await browser.elementByCss('a[href="/mixed/en/allowed"]').click()
      }
      expect(await browser.elementById('mixed-params').text()).toBe(
        'en/allowed'
      )
      expect(await getClosedSegments(browser)).toEqual(['[lang]'])
      await browser.close()
    }
  )

  it('keeps the suffix open and preserves node-local build hints without inlining', async () => {
    const browser = await next.browser('/mixed/en/novel')
    expect(await browser.elementById('mixed-params').text()).toBe('en/novel')
    expect(await getClosedSegments(browser)).toEqual(['[lang]'])
    await browser.close()
    expect((await next.fetch('/mixed/es/allowed')).status).toBe(404)

    // Build artifacts are only available locally; the browser and routing
    // assertions above also run in dev and against deployments.
    if (isNextStart) {
      const manifest: PrerenderManifest = await next.readJSON(
        '.next/prerender-manifest.json'
      )
      expect(
        manifest.dynamicRoutes['/mixed/[lang]/[slug]'].notFoundParams
      ).toEqual(['lang'])
      const hints: Record<string, PrefetchHints> = await next.readJSON(
        '.next/server/prefetch-hints.json'
      )
      let node: PrefetchHints | undefined = hints['/mixed/[lang]/[slug]']
      const closedHints: number[] = []
      while (node) {
        closedHints.push(node.hints & 0b1000000000000000)
        node = node.slots?.children
      }
      // Root, mixed, [lang], [slug], page. Only [lang] is closed.
      expect(closedHints).toEqual([0, 0, 0b1000000000000000, 0, 0])
    }
  })
})
