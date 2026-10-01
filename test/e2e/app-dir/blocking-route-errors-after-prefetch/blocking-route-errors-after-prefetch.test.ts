import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type { Page } from 'playwright'

// Prefetching is disabled in dev, and route prediction only happens in a
// production build.
// @force-gate prefetching
describe('blocking-route-errors-after-prefetch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function prefetch(
    from: string,
    href: string,
    expectedPrefetch?: 'no-requests'
  ) {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser(from, {
      beforePageLoad(page: Page) {
        act = createRouterAct(page)
      },
    })

    // Reveal the link and wait for its prefetch to finish, so that the client
    // has a static shell of the page before it navigates.
    await act(async () => {
      const toggle = await browser.elementByCss(
        `input[data-link-accordion="${href}"]`
      )
      await toggle.click()
    }, expectedPrefetch)

    return browser
  }

  async function navigate(
    from: string,
    href: string,
    expectedPrefetch?: 'no-requests'
  ) {
    const browser = await prefetch(from, href, expectedPrefetch)
    const link = await browser.elementByCss(`a[href="${href}"]`)
    await link.click()
    return browser
  }

  it('renders a page that blocks on request-time data', async () => {
    const browser = await navigate('/', '/dynamic')
    expect(await browser.elementById('dynamic').text()).toBe('Dynamic')
    expect(await browser.url()).toBe(`${next.url}/dynamic`)
  })

  it('follows a redirect()', async () => {
    const browser = await navigate('/', '/redirect')
    expect(await browser.elementById('destination').text()).toBe('Destination')
    expect(await browser.url()).toBe(`${next.url}/destination`)
  })

  it('renders the not-found boundary after a notFound()', async () => {
    const browser = await navigate('/', '/missing')
    expect(await browser.elementById('not-found-boundary').text()).toBe(
      'Not found boundary'
    )
    expect(await browser.url()).toBe(`${next.url}/missing`)
  })

  it('renders the error boundary after a thrown error', async () => {
    const browser = await navigate('/', '/throws')
    expect(await browser.elementById('error-boundary').text()).toBe(
      'Error boundary'
    )
    expect(await browser.url()).toBe(`${next.url}/throws`)
  })

  it('follows a redirect() when the viewport is blocking, too', async () => {
    const browser = await navigate('/', '/dynamic-viewport')
    expect(await browser.elementById('destination').text()).toBe('Destination')
    expect(await browser.url()).toBe(`${next.url}/destination`)
  })

  it('follows a redirect() after a redirect() from a Server Action', async () => {
    const browser = await prefetch('/', '/redirect')
    await browser.elementById('redirect-from-action').click()
    expect(await browser.elementById('destination').text()).toBe('Destination')
    expect(await browser.url()).toBe(`${next.url}/destination`)
  })

  it('follows a redirect() to another page of the same dynamic route', async () => {
    // The link isn't prefetched. The client reuses the static shell of the
    // route that it received on the initial page load.
    const browser = await navigate('/item/1', '/item/moved', 'no-requests')
    expect(await browser.elementById('destination').text()).toBe('Destination')
    expect(await browser.url()).toBe(`${next.url}/destination`)
  })

  it('follows a redirect() inside of a Suspense boundary below a blocking layout', async () => {
    const browser = await navigate('/', '/blocking-layout/redirect-in-suspense')
    expect(await browser.elementById('destination').text()).toBe('Destination')
    expect(await browser.url()).toBe(`${next.url}/destination`)
  })

  it('renders the not-found boundary after a notFound() in a partially prerendered route', async () => {
    const browser = await navigate('/catch-all', '/catch-all/missing')
    expect(await browser.elementById('not-found-boundary').text()).toBe(
      'Not found boundary'
    )
    expect(await browser.url()).toBe(`${next.url}/catch-all/missing`)
  })
})
