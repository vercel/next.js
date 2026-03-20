import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache - vary params base dynamic', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('prefetching is disabled in dev mode', () => {})
    return
  }

  it('keeps dynamic segment params valid before and after time-based revalidation', async () => {
    const collectSegmentPrefetchResponses = async (href: string) => {
      let act: ReturnType<typeof createRouterAct>
      const segmentPrefetchResponses: Array<
        Promise<{ body: string; segmentPrefetchPath: string }>
      > = []

      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
          p.on('response', (response) => {
            const request = response.request()
            const segmentPath =
              request.headers()['next-router-segment-prefetch']

            if (segmentPath) {
              const pathname = new URL(request.url()).pathname
              const segmentPrefetchPath = pathname.endsWith('.rsc')
                ? `${pathname.slice(0, -'.rsc'.length)}.segments${segmentPath}.segment.rsc`
                : `${pathname}.segments${segmentPath}.segment.rsc`

              segmentPrefetchResponses.push(
                response
                  .text()
                  .then((body) => ({ body, segmentPrefetchPath }))
                  .catch(() => ({ body: '', segmentPrefetchPath }))
              )
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

    const assertValidSegmentResponses = (
      responses: Array<{ body: string; segmentPrefetchPath: string }>
    ) => {
      const bodies = responses.map((response) => response.body)
      const allBodies = bodies.join('\n')
      const segmentPrefetchPaths = [
        ...new Set(responses.map((response) => response.segmentPrefetchPath)),
      ]

      expect(bodies.length).toBeGreaterThan(0)
      expect(allBodies.includes('%5BteamSlug%5D')).toBe(false)
      expect(allBodies.includes('%5Bproject%5D')).toBe(false)
      expect(
        segmentPrefetchPaths.some((path) =>
          path.startsWith('/acme/dashboard.segments/')
        )
      ).toBe(true)
      expect(
        segmentPrefetchPaths.some((path) =>
          path.startsWith('/globex/portal.segments/')
        )
      ).toBe(true)
      expect(
        segmentPrefetchPaths.every(
          (path) => path.includes('.segments/') && path.endsWith('.segment.rsc')
        )
      ).toBe(true)
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
})
