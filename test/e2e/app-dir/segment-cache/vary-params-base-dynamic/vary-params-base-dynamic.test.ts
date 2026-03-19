import { nextTestSetup } from 'e2e-utils'
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

  it('keeps dynamic segment params valid before and after revalidation', async () => {
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

    const assertRouteResponse = async (path: string, expectedText: string) => {
      const browser = await next.browser(path)
      const content = await browser.elementByCss('[data-team-project-content]')
      expect(await content.text()).toContain(expectedText)
      await browser.close()
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

      return segmentPrefetchPaths
    }

    await assertRouteResponse(
      '/acme/dashboard',
      'Team project content - team: acme, project: dashboard'
    )
    await assertRouteResponse(
      '/globex/portal',
      'Team project content - team: globex, project: portal'
    )

    const initialResponses = [
      ...(await collectSegmentPrefetchResponses('/acme/dashboard')),
      ...(await collectSegmentPrefetchResponses('/globex/portal')),
    ]
    const segmentPrefetchPaths = assertValidSegmentResponses(initialResponses)

    const revalidateQuery = new URLSearchParams()
    for (const path of segmentPrefetchPaths) {
      revalidateQuery.append('path', path)
    }

    const revalidateRes = await next.fetch(
      `/api/revalidate?${revalidateQuery.toString()}`
    )
    expect(revalidateRes.status).toBe(200)
    expect(await revalidateRes.json()).toEqual({ revalidated: true })

    const revalidatedResponses = [
      ...(await collectSegmentPrefetchResponses('/acme/dashboard')),
      ...(await collectSegmentPrefetchResponses('/globex/portal')),
    ]
    assertValidSegmentResponses(revalidatedResponses)

    await assertRouteResponse(
      '/acme/dashboard',
      'Team project content - team: acme, project: dashboard'
    )
    await assertRouteResponse(
      '/globex/portal',
      'Team project content - team: globex, project: portal'
    )
  })
})
