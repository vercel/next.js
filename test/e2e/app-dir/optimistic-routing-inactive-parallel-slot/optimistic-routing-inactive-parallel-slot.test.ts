import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type { Page, Request } from 'playwright'

describe('optimistic-routing-inactive-parallel-slot', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Known Routes prediction is only used in production builds.
    test('skipped in dev mode', () => {})
    return
  }

  it('predicts a route whose parallel slot renders default', async () => {
    let act!: ReturnType<typeof createRouterAct>
    const navigationRequests = new Map<string, number>()
    const navigationRouterStates = new Map<string, string>()
    const browser = await next.browser('/a', {
      beforePageLoad(page: Page) {
        act = createRouterAct(page)
        page.on('request', (request: Request) => {
          const headers = request.headers()
          if (headers.rsc === undefined) return
          if (headers['next-router-prefetch'] !== undefined) return
          const pathname = new URL(request.url()).pathname
          navigationRequests.set(
            pathname,
            (navigationRequests.get(pathname) ?? 0) + 1
          )
          if (!navigationRouterStates.has(pathname)) {
            navigationRouterStates.set(
              pathname,
              decodeURIComponent(headers['next-router-state-tree'] ?? '')
            )
          }
        })
      },
    })
    expect(await browser.elementById('sidebar').text()).toBe('Sidebar a')

    // Learn the /b/[id] route. @sidebar has no match, so the route has a
    // default segment in that slot, and the client keeps showing 'a'.
    await act(async () => {
      await browser.elementById('go-b-1').click()
    })
    expect(await browser.elementById('heading').text()).toBe('Page b 1')
    expect(await browser.elementById('sidebar').text()).toBe('Sidebar a')

    await act(async () => {
      await browser.elementById('go-c').click()
    })
    expect(await browser.elementById('sidebar').text()).toBe('Sidebar c')

    await act(async () => {
      await browser.elementById('go-b-2').click()
    })
    expect(await browser.elementById('heading').text()).toBe('Page b 2')
    // The default slot keeps the segment that's active now.
    expect(await browser.elementById('sidebar').text()).toBe('Sidebar c')
    expect(navigationRequests.get('/b/2')).toBe(1)
    // The navigation request is sent with the predicted route tree, not the
    // current one.
    expect(navigationRouterStates.get('/b/2')).toContain('["id","2","d"')
  })
})
