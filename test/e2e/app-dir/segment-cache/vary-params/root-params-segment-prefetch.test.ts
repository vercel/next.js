import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache - root params segment prefetch', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('prefetching is disabled in dev mode', () => {})
    return
  }

  it('does not encode root param placeholders in segment-prefetch responses, even after revalidation', async () => {
    const collectSegmentPrefetchResponses = async () => {
      let act: ReturnType<typeof createRouterAct>
      const segmentPrefetchResponses: Array<
        Promise<{
          body: string
          pathname: string
          segmentPrefetchPath: string
        }>
      > = []
      const browser = await next.browser('/root-params', {
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
                  .then((body) => ({ body, pathname, segmentPrefetchPath }))
                  .catch(() => ({ body: '', pathname, segmentPrefetchPath }))
              )
            }
          })
        },
      })

      await act(
        async () => {
          const toggle = await browser.elementByCss(
            'input[data-link-accordion="/aaa"]'
          )
          await toggle.click()
        },
        { includes: 'Root param page content - param: aaa' }
      )

      await act(
        async () => {
          const toggle = await browser.elementByCss(
            'input[data-link-accordion="/bbb"]'
          )
          await toggle.click()
        },
        { includes: 'Root param page content - param: bbb' }
      )

      const settledSegmentPrefetchResponses = await Promise.all(
        segmentPrefetchResponses
      )
      await browser.close()

      return settledSegmentPrefetchResponses
    }

    const assertHasValidParams = (
      responses: Array<{
        body: string
        pathname: string
        segmentPrefetchPath: string
      }>
    ) => {
      const bodies = responses.map((response) => response.body)

      expect(bodies.length).toBeGreaterThan(0)
      expect(bodies.some((body) => body.includes('%5BrootParam%5D'))).toBe(
        false
      )
      expect(
        bodies.some((body) =>
          body.includes('Root param page content - param: aaa')
        )
      ).toBe(true)
      expect(
        bodies.some((body) =>
          body.includes('Root param page content - param: bbb')
        )
      ).toBe(true)
    }

    const initialResponses = await collectSegmentPrefetchResponses()
    assertHasValidParams(initialResponses)

    const segmentPrefetchPathnames = [
      ...new Set(
        initialResponses.map((response) => response.segmentPrefetchPath)
      ),
    ]

    expect(segmentPrefetchPathnames.length).toBeGreaterThan(0)
    expect(
      segmentPrefetchPathnames.some((pathname) =>
        pathname.startsWith('/aaa.segments/')
      )
    ).toBe(true)
    expect(
      segmentPrefetchPathnames.some((pathname) =>
        pathname.startsWith('/bbb.segments/')
      )
    ).toBe(true)

    const revalidateSegmentPrefetchQuery = new URLSearchParams()
    for (const pathname of segmentPrefetchPathnames) {
      revalidateSegmentPrefetchQuery.append('path', pathname)
    }

    const revalidateRes = await next.fetch(
      `/api/revalidate?${revalidateSegmentPrefetchQuery.toString()}`
    )
    expect(revalidateRes.status).toBe(200)
    expect(await revalidateRes.json()).toEqual({ revalidated: true })

    const revalidatedResponses = await collectSegmentPrefetchResponses()
    assertHasValidParams(revalidatedResponses)
  })
})
