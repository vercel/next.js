import { nextTestSetup } from 'e2e-utils'
import type { PrerenderManifest } from 'next/dist/build'
import type { FlightRouterState } from 'next/dist/shared/lib/app-router-types'
import { createRouterAct } from 'router-act'

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

  async function hasClosedParamDescendants(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    return browser.eval(() => {
      const tree: FlightRouterState =
        window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE.tree
      // PrefetchHint.SubtreeHasClosedParams summarizes descendants at the root.
      return ((tree[4] ?? 0) & 0b10000000000000000) !== 0
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
      expect(await hasClosedParamDescendants(browser)).toBe(true)
      await browser.close()
    }
  )

  it('does not mark open routes as closed', async () => {
    const browser = await next.browser('/')
    expect(await getClosedSegments(browser)).toEqual([])
    expect(await hasClosedParamDescendants(browser)).toBe(false)
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
      expect(await hasClosedParamDescendants(browser)).toBe(true)
      await browser.close()
    }
  )

  // @force-gate prefetching
  it('preserves closed-parameter hints on a prefetched navigation without inlining', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page, { includeAppShellRequests: true })
      },
    })

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/mixed/en/allowed"]')
          .click()
      },
      { includes: 'en/allowed' }
    )
    await act(async () => {
      await browser.elementByCss('#mixed-prefetch a').click()
    }, 'no-requests')

    expect(await browser.elementById('mixed-params').text()).toBe('en/allowed')
    expect(await getClosedSegments(browser)).toEqual(['[lang]'])
    expect(await hasClosedParamDescendants(browser)).toBe(true)
    await browser.close()
  })

  it('keeps the suffix open without inlining', async () => {
    const browser = await next.browser('/mixed/en/novel')
    expect(await browser.elementById('mixed-params').text()).toBe('en/novel')
    expect(await getClosedSegments(browser)).toEqual(['[lang]'])
    expect(await hasClosedParamDescendants(browser)).toBe(true)
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
    }
  })
})
