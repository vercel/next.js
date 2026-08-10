import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

type RevalidateMode =
  | 'tag-layout-expireNow'
  | 'tag-layout-max'
  | 'tag-layout-legacy'
  | 'path-root-layout'
  | 'path-team-layout'
  | 'path-team-page'
type BrowserRevalidateMode =
  | 'tag-layout-expireNow'
  | 'tag-layout-max'
  | 'tag-layout-legacy'
  | 'server-action-tag-layout-expireNow'
  | 'server-action-tag-layout-max'
  | 'server-action-tag-layout-legacy'

type SegmentPrefetchResponse = {
  body: string
  requestPathname: string
  requestSegmentPath: string
  segmentPrefetchPath: string
  status: number
}

describe('segment cache - vary params base dynamic', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('prefetching is disabled in dev mode', () => {})
    return
  }

  const expectedTextByHref: Record<string, string> = {
    '/acme/dashboard': 'Team project content - team: acme, project: dashboard',
    '/globex/portal': 'Team project content - team: globex, project: portal',
    '/acme/dashboard/settings':
      'Project settings overview content - team: acme, project: dashboard',
    '/globex/portal/settings':
      'Project settings overview content - team: globex, project: portal',
    '/acme/dashboard/settings/domains':
      'Project domains settings content - team: acme, project: dashboard',
    '/globex/portal/settings/domains':
      'Project domains settings content - team: globex, project: portal',
  }

  const toSegmentPrefetchResponse = (
    response: Playwright.Response
  ): Promise<SegmentPrefetchResponse> | null => {
    const request = response.request()
    const segmentPath = request.headers()['next-router-segment-prefetch']

    if (!segmentPath) {
      return null
    }

    const pathname = new URL(request.url()).pathname
    const segmentPrefetchPath = pathname.endsWith('.rsc')
      ? `${pathname.slice(0, -'.rsc'.length)}.segments${segmentPath}.segment.rsc`
      : `${pathname}.segments${segmentPath}.segment.rsc`

    return response
      .text()
      .then((body) => ({
        body,
        requestPathname: pathname,
        requestSegmentPath: segmentPath,
        segmentPrefetchPath,
        status: response.status(),
      }))
      .catch(() => ({
        body: '',
        requestPathname: pathname,
        requestSegmentPath: segmentPath,
        segmentPrefetchPath,
        status: response.status(),
      }))
  }

  const collectSegmentPrefetchResponses = async (
    href: string,
    startPath: string = '/'
  ) => {
    let act: ReturnType<typeof createRouterAct>
    const segmentPrefetchResponses: Array<Promise<SegmentPrefetchResponse>> = []

    const browser = await next.browser(startPath, {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
        p.on('response', (response) => {
          const prefetchResponse = toSegmentPrefetchResponse(response)
          if (prefetchResponse !== null) {
            segmentPrefetchResponses.push(prefetchResponse)
          }
        })
      },
    })

    await act(async () => {
      const toggle = await browser.elementByCss(
        `input[data-link-accordion="${href}"]`
      )
      await toggle.click()
    })

    const settledResponses = await Promise.all(segmentPrefetchResponses)
    await browser.close()

    return settledResponses
  }

  const collectSegmentPrefetchResponsesFromBackForwardNavigation = async (
    browserRevalidateMode?: BrowserRevalidateMode
  ) => {
    const segmentPrefetchResponses: Array<Promise<SegmentPrefetchResponse>> = []
    const pageErrors: Array<string> = []

    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        p.on('response', (response) => {
          const prefetchResponse = toSegmentPrefetchResponse(response)
          if (prefetchResponse !== null) {
            segmentPrefetchResponses.push(prefetchResponse)
          }
        })
        p.on('pageerror', (error) => {
          pageErrors.push(error.message)
        })
      },
    })

    const expectHomePage = async () => {
      await retry(async () => {
        const content = await browser.elementByCss('#home-page')
        expect(await content.text()).toContain('Root Dynamic Route Vary Params')
      })
    }

    const expectTeamPage = async (
      href: '/acme/dashboard' | '/globex/portal'
    ) => {
      const expectedText = expectedTextByHref[href]

      await retry(async () => {
        const content = await browser.elementByCss(
          '[data-team-project-content]'
        )
        expect(await content.text()).toContain(expectedText)
      })
    }

    const clickVisibleLink = async (href: string) => {
      const link = await browser.elementByCss(`a[data-nav-link="${href}"]`)
      await link.click()
    }

    await expectHomePage()

    if (browserRevalidateMode) {
      const button = await browser.elementById(
        `revalidate-in-browser-${browserRevalidateMode}`
      )
      await button.click()

      await retry(async () => {
        const result = await browser.elementById('revalidate-result').text()
        expect(result).toContain('"revalidated":true')
        expect(result).toContain(`"mode":"${browserRevalidateMode}"`)
      })

      await waitFor(500)
    }

    await waitFor(300)

    await clickVisibleLink('/acme/dashboard')
    await expectTeamPage('/acme/dashboard')

    for (let cycle = 0; cycle < 3; cycle++) {
      await browser.back()
      await expectHomePage()
      await waitFor(250)

      await browser.forward()
      await expectTeamPage('/acme/dashboard')
      await waitFor(250)
    }

    await clickVisibleLink('/globex/portal')
    await expectTeamPage('/globex/portal')

    for (let cycle = 0; cycle < 2; cycle++) {
      await browser.back()
      await expectTeamPage('/acme/dashboard')
      await waitFor(250)

      await browser.forward()
      await expectTeamPage('/globex/portal')
      await waitFor(250)
    }

    await browser.back()
    await expectTeamPage('/acme/dashboard')
    await browser.back()
    await expectHomePage()
    await waitFor(500)

    const settledResponses = await Promise.all(segmentPrefetchResponses)
    await browser.close()

    return {
      pageErrors,
      responses: settledResponses,
    }
  }

  const collectSegmentPrefetchResponsesFromProductionShapeNavigation =
    async () => {
      const segmentPrefetchResponses: Array<Promise<SegmentPrefetchResponse>> =
        []
      const pageErrors: Array<string> = []

      const browser = await next.browser('/acme/dashboard/settings', {
        beforePageLoad(p: Playwright.Page) {
          p.on('response', (response) => {
            const prefetchResponse = toSegmentPrefetchResponse(response)
            if (prefetchResponse !== null) {
              segmentPrefetchResponses.push(prefetchResponse)
            }
          })
          p.on('pageerror', (error) => {
            pageErrors.push(error.message)
          })
        },
      })

      const clickVisibleLink = async (href: string) => {
        const link = await browser.elementByCss(`a[data-nav-link="${href}"]`)
        await link.click()
      }

      const expectProjectSettingsPage = async (
        team: 'acme' | 'globex',
        project: 'dashboard' | 'portal'
      ) => {
        const expectedText = expectedTextByHref[`/${team}/${project}/settings`]
        await retry(async () => {
          const content = await browser.elementByCss(
            '[data-team-project-settings-content]'
          )
          expect(await content.text()).toContain(expectedText)
        })
      }

      const expectProjectDomainsPage = async (
        team: 'acme' | 'globex',
        project: 'dashboard' | 'portal'
      ) => {
        const expectedText =
          expectedTextByHref[`/${team}/${project}/settings/domains`]
        await retry(async () => {
          const content = await browser.elementByCss(
            '[data-team-project-settings-domains-content]'
          )
          expect(await content.text()).toContain(expectedText)
        })
      }

      await expectProjectSettingsPage('acme', 'dashboard')
      await waitFor(300)

      await clickVisibleLink('/acme/dashboard/settings/domains')
      await expectProjectDomainsPage('acme', 'dashboard')

      for (let cycle = 0; cycle < 3; cycle++) {
        await browser.back()
        await expectProjectSettingsPage('acme', 'dashboard')
        await waitFor(250)

        await browser.forward()
        await expectProjectDomainsPage('acme', 'dashboard')
        await waitFor(250)
      }

      await clickVisibleLink('/globex/portal/settings/domains')
      await expectProjectDomainsPage('globex', 'portal')

      for (let cycle = 0; cycle < 2; cycle++) {
        await browser.back()
        await expectProjectDomainsPage('acme', 'dashboard')
        await waitFor(250)

        await browser.forward()
        await expectProjectDomainsPage('globex', 'portal')
        await waitFor(250)
      }

      await browser.back()
      await expectProjectDomainsPage('acme', 'dashboard')
      await browser.back()
      await expectProjectSettingsPage('acme', 'dashboard')
      await waitFor(500)

      const settledResponses = await Promise.all(segmentPrefetchResponses)
      await browser.close()

      return {
        pageErrors,
        responses: settledResponses,
      }
    }

  const assertNoEncodedDynamicPlaceholders = (value: string) => {
    expect(value.includes('%5BteamSlug%5D')).toBe(false)
    expect(value.includes('%5Bproject%5D')).toBe(false)
    expect(value.includes('%255BteamSlug%255D')).toBe(false)
    expect(value.includes('%255Bproject%255D')).toBe(false)
    expect(value.includes('[teamSlug]')).toBe(false)
    expect(value.includes('[project]')).toBe(false)
  }

  const assertValidSegmentResponses = (
    responses: Array<SegmentPrefetchResponse>,
    expectedRoutePrefixes: Array<string> = ['/acme/dashboard', '/globex/portal']
  ) => {
    const bodies = responses.map((response) => response.body)
    const requestPathnames = responses.map(
      (response) => response.requestPathname
    )
    const requestSegmentPaths = responses.map(
      (response) => response.requestSegmentPath
    )

    // Webpack flight payloads can include module chunk references like:
    // `static/chunks/app/%5Bslug%5D/page-*.js`. These are build artifact paths,
    // not route params, so strip them before placeholder assertions.
    const cleanedBodies = bodies.map((body) =>
      body.replace(/static\/chunks\/app\/[^"'\n]+\.js/g, '')
    )
    const allBodies = cleanedBodies.join('\n')
    const allRequestPathnames = requestPathnames.join('\n')
    const allRequestSegmentPaths = requestSegmentPaths.join('\n')
    const segmentPrefetchPaths = [
      ...new Set(responses.map((response) => response.segmentPrefetchPath)),
    ]

    expect(bodies.length).toBeGreaterThan(0)
    expect(responses.some((response) => response.status >= 400)).toBe(false)

    assertNoEncodedDynamicPlaceholders(allBodies)
    assertNoEncodedDynamicPlaceholders(allRequestPathnames)
    assertNoEncodedDynamicPlaceholders(allRequestSegmentPaths)

    expect(segmentPrefetchPaths.some((path) => path.includes('%5B'))).toBe(
      false
    )
    expect(segmentPrefetchPaths.some((path) => path.includes('%255B'))).toBe(
      false
    )
    expect(
      segmentPrefetchPaths.some((path) => path.includes('[teamSlug]'))
    ).toBe(false)
    expect(
      segmentPrefetchPaths.some((path) => path.includes('[project]'))
    ).toBe(false)
    for (const routePrefix of expectedRoutePrefixes) {
      expect(
        segmentPrefetchPaths.some((path) =>
          path.startsWith(`${routePrefix}.segments/`)
        )
      ).toBe(true)
    }
    expect(
      segmentPrefetchPaths.every(
        (path) => path.includes('.segments/') && path.endsWith('.segment.rsc')
      )
    ).toBe(true)
  }

  const warmSegmentCache = async () => {
    const warmedResponses = [
      ...(await collectSegmentPrefetchResponses('/acme/dashboard')),
      ...(await collectSegmentPrefetchResponses('/globex/portal')),
    ]
    assertValidSegmentResponses(warmedResponses)
  }

  const primeProductionShapeRouteCache = async () => {
    const acmeDomains = await next.fetch('/acme/dashboard/settings/domains')
    const globexDomains = await next.fetch('/globex/portal/settings/domains')

    expect(acmeDomains.status).toBe(200)
    expect(globexDomains.status).toBe(200)
  }

  const triggerRevalidation = async (mode: RevalidateMode) => {
    const revalidateResponse = await next.fetch(
      `/api/revalidate-layout?mode=${mode}`
    )
    expect(revalidateResponse.status).toBe(200)
    expect(await revalidateResponse.json()).toEqual({
      revalidated: true,
      mode,
    })
  }

  it('keeps dynamic segment params valid before and after time-based revalidation', async () => {
    const readRouteMarker = async (path: string, expectedText: string) => {
      const browser = await next.browser(path)
      const content = await browser.elementByCss('[data-team-project-content]')
      const text = await content.text()
      await browser.close()

      expect(text).toContain(expectedText)
      const markerMatch = text.match(/marker: (\d+)/)
      expect(markerMatch).not.toBeNull()
      return Number(markerMatch![1])
    }

    const initialAcmeMarker = await readRouteMarker(
      '/acme/dashboard',
      'Team project content - team: acme, project: dashboard'
    )
    const initialGlobexMarker = await readRouteMarker(
      '/globex/portal',
      'Team project content - team: globex, project: portal'
    )

    const initialResponses = [
      ...(await collectSegmentPrefetchResponses('/acme/dashboard')),
      ...(await collectSegmentPrefetchResponses('/globex/portal')),
    ]
    assertValidSegmentResponses(initialResponses)

    let lastAcmeMarker = initialAcmeMarker
    let lastGlobexMarker = initialGlobexMarker

    for (let checkIndex = 0; checkIndex < 5; checkIndex++) {
      await waitFor(2_000)

      const revalidatedResponses = [
        ...(await collectSegmentPrefetchResponses('/acme/dashboard')),
        ...(await collectSegmentPrefetchResponses('/globex/portal')),
      ]
      assertValidSegmentResponses(revalidatedResponses)

      const revalidatedAcmeMarker = await readRouteMarker(
        '/acme/dashboard',
        'Team project content - team: acme, project: dashboard'
      )
      const revalidatedGlobexMarker = await readRouteMarker(
        '/globex/portal',
        'Team project content - team: globex, project: portal'
      )

      expect(revalidatedAcmeMarker).not.toBe(lastAcmeMarker)
      expect(revalidatedGlobexMarker).not.toBe(lastGlobexMarker)

      lastAcmeMarker = revalidatedAcmeMarker
      lastGlobexMarker = revalidatedGlobexMarker
    }
  })

  it.each<RevalidateMode>([
    'tag-layout-expireNow',
    'tag-layout-max',
    'tag-layout-legacy',
    'path-root-layout',
    'path-team-layout',
    'path-team-page',
  ])(
    'keeps dynamic segment params valid after %s with in-view Link back/forward navigations',
    async (mode) => {
      await warmSegmentCache()
      await triggerRevalidation(mode)

      const navigationResult =
        await collectSegmentPrefetchResponsesFromBackForwardNavigation()

      assertValidSegmentResponses(navigationResult.responses)

      expect(
        navigationResult.pageErrors.some(
          (error) =>
            error.includes('Minified React error') ||
            error.includes('not-found') ||
            error.includes('Invariant')
        )
      ).toBe(false)
    }
  )

  it.each<BrowserRevalidateMode>([
    'tag-layout-expireNow',
    'tag-layout-max',
    'tag-layout-legacy',
    'server-action-tag-layout-expireNow',
    'server-action-tag-layout-max',
    'server-action-tag-layout-legacy',
  ])(
    'keeps dynamic segment params valid when browser-triggered revalidation uses %s',
    async (mode) => {
      await warmSegmentCache()

      const navigationResult =
        await collectSegmentPrefetchResponsesFromBackForwardNavigation(mode)

      assertValidSegmentResponses(navigationResult.responses)

      expect(
        navigationResult.pageErrors.some(
          (error) =>
            error.includes('Minified React error') ||
            error.includes('not-found') ||
            error.includes('Invariant')
        )
      ).toBe(false)
    }
  )

  it.each<RevalidateMode>(['tag-layout-expireNow', 'tag-layout-legacy'])(
    'keeps params valid for production route shape /[team]/[project]/settings/domains after %s',
    async (mode) => {
      await primeProductionShapeRouteCache()
      await triggerRevalidation(mode)

      const navigationResult =
        await collectSegmentPrefetchResponsesFromProductionShapeNavigation()

      assertValidSegmentResponses(navigationResult.responses, [
        '/acme/dashboard/settings/domains',
        '/globex/portal/settings/domains',
      ])

      expect(
        navigationResult.pageErrors.some(
          (error) =>
            error.includes('Minified React error') ||
            error.includes('not-found') ||
            error.includes('Invariant')
        )
      ).toBe(false)
    }
  )
})
