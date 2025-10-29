import { nextTestSetup } from 'e2e-utils'
import {
  getSegmentExplorerContent,
  getSegmentExplorerRoute,
  retry,
} from 'next-test-utils'

describe('segment-explorer', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the segment explorer for parallel routes', async () => {
    const browser = await next.browser('/parallel-routes')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     parallel-routes/ [layout.tsx, page.tsx]
     @bar/ [layout.tsx, page.tsx]
     @foo/ [layout.tsx, page.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe('/parallel-routes')
  })

  it('should render the segment explorer for parallel routes in edge runtime', async () => {
    const browser = await next.browser('/parallel-routes-edge')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     parallel-routes-edge/ [layout.tsx, page.tsx]
     @bar/ [layout.tsx, page.tsx]
     @foo/ [layout.tsx, page.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe('/parallel-routes-edge')
  })

  it('should render the segment explorer for nested routes', async () => {
    const browser = await next.browser('/blog/~/grid')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     (v2)/ [layout.tsx]
     blog / (team)/ [layout.tsx, template.tsx]
     ~ / (overview)/ [layout.tsx]
     grid/ [page.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe('/blog/~/grid')
  })

  it('should cleanup on soft navigation', async () => {
    const browser = await next.browser('/soft-navigation/a')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     soft-navigation / a/ [page.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe('/soft-navigation/a')

    await browser.elementByCss('[href="/soft-navigation/b"]').click()
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toContain('Page B')
    })

    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     soft-navigation / b/ [page.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe('/soft-navigation/b')
  })

  it('should handle show file segments in order', async () => {
    const browser = await next.browser('/file-segments')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     (all) / file-segments/ [layout.tsx, template.tsx, page.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe('/file-segments')
  })

  it('should not have route info panel for pages router', async () => {
    const browser = await next.browser('/pages-router')
    expect(await browser.hasElementByCss('[data-segment-explorer]')).toBe(false)
  })

  it('should handle special built-in not-found segments', async () => {
    const browser = await next.browser('/404')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(
      `"app/ [layout.tsx, not-found.js]"`
    )
    expect(await getSegmentExplorerRoute(browser)).toBe('/404')
  })

  it('should show global-error segment', async () => {
    const browser = await next.browser('/runtime-error')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(
      `"app/ [global-error.js]"`
    )
    // FIXME: handle preserve the url when hitting global-error
    expect(await getSegmentExplorerRoute(browser)).toBe('<empty>')
  })

  it('should show navigation boundaries of the segment', async () => {
    const browser = await next.browser('/boundary?name=not-found')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     boundary/ [layout.tsx, not-found.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe(
      '/boundary?name=not-found'
    )

    await browser.loadPage(`${next.url}/boundary?name=forbidden`)
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     boundary/ [layout.tsx, forbidden.tsx]"
    `)

    await browser.loadPage(`${next.url}/boundary?name=unauthorized`)
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     boundary/ [layout.tsx, unauthorized.tsx]"
    `)
  })

  it('should show the loading boundary when it is present', async () => {
    const browser = await next.browser('/search')
    const input = await browser.elementByCss('input[name="q"]')
    await input.fill('abc')
    await browser.elementByCss('button').click() // submit the form

    await retry(async () => {
      expect(await browser.elementByCss('#loading').text()).toBe('Loading...')
    })

    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     search/ [layout.tsx, loading.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe('/search?q=abc')
  })

  it('should show the custom error boundary when present', async () => {
    const browser = await next.browser('/runtime-error/boundary')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     runtime-error / boundary/ [error.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe(
      '/runtime-error/boundary'
    )
  })

  it('should display parallel routes default page when present', async () => {
    const browser = await next.browser('/parallel-default/subroute')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     parallel-default/ [layout.tsx, default.tsx]
     @bar/ [layout.tsx]
     subroute/ [page.tsx]
     @foo/ [default.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe(
      '/parallel-default/subroute'
    )
  })

  it('should display boundary selector when a segment has only boundary files', async () => {
    const browser = await next.browser('/no-layout/framework/blog')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/ [layout.tsx]
     no-layout/ []
     framework/ [layout.tsx]
     blog/ [layout.tsx, page.tsx]"
    `)
    expect(await getSegmentExplorerRoute(browser)).toBe(
      '/no-layout/framework/blog'
    )
  })

  it('should render route for index page', async () => {
    const browser = await next.browser('/')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(
      `"app/ [layout.tsx, page.tsx]"`
    )
    expect(await getSegmentExplorerRoute(browser)).toBe('/')
  })
})
