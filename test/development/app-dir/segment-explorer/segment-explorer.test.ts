import { nextTestSetup } from 'e2e-utils'
import { openDevToolsIndicatorPopover, retry } from 'next-test-utils'
import { Playwright } from 'next-webdriver'

async function getSegmentExplorerContent(browser: Playwright) {
  // open the devtool button
  await openDevToolsIndicatorPopover(browser)

  // open segment explorer tab
  await browser
    .elementByCss('[data-nextjs-devtools-panel-header-tab="route"]')
    .click()

  //  wait for the segment explorer to be visible
  await browser.waitForElementByCss('[data-nextjs-devtool-segment-explorer]')

  const content = await browser.elementByCss(
    '[data-nextjs-devtool-segment-explorer]'
  )
  return content.text()
}

describe('segment-explorer', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the segment explorer for parallel routes', async () => {
    const browser = await next.browser('/parallel-routes')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     parallel-routes/
     layout.tsx
     page.tsx
     @bar/
     layout.tsx
     page.tsx
     @foo/
     layout.tsx
     page.tsx"
    `)
  })

  it('should render the segment explorer for parallel routes in edge runtime', async () => {
    const browser = await next.browser('/parallel-routes-edge')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     parallel-routes-edge/
     layout.tsx
     page.tsx
     @bar/
     layout.tsx
     page.tsx
     @foo/
     layout.tsx
     page.tsx"
    `)
  })

  it('should render the segment explorer for nested routes', async () => {
    const browser = await next.browser('/blog/~/grid')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     (v2)/
     layout.tsx
     blog / (team)/
     layout.tsx
     template.tsx
     ~ / (overview)/
     layout.tsx
     grid/
     page.tsx"
    `)
  })

  it('should cleanup on soft navigation', async () => {
    const browser = await next.browser('/soft-navigation/a')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     soft-navigation / a/
     page.tsx"
    `)

    await browser.elementByCss('[href="/soft-navigation/b"]').click()
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toContain('Page B')
      expect(await browser.url()).toBe(`${next.url}/soft-navigation/b`)
    })

    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     soft-navigation / b/
     page.tsx"
    `)
  })

  it('should handle show file segments in order', async () => {
    const browser = await next.browser('/file-segments')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     (all) / file-segments/
     layout.tsx
     template.tsx
     page.tsx"
    `)
  })

  it('should indicate segment explorer is not available for pages router', async () => {
    const browser = await next.browser('/pages-router')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(
      `"Route Info currently is only available for the App Router."`
    )
  })

  it('should handle special built-in not-found segments', async () => {
    const browser = await next.browser('/404')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     not-found.js"
    `)
  })

  it('should show global-error segment', async () => {
    const browser = await next.browser('/runtime-error')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     global-error.js"
    `)
  })

  it('should show navigation boundaries of the segment', async () => {
    const browser = await next.browser('/boundary?name=not-found')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     boundary/
     layout.tsx
     not-found.tsx"
    `)

    await browser.loadPage(`${next.url}/boundary?name=forbidden`)
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     boundary/
     layout.tsx
     forbidden.tsx"
    `)

    await browser.loadPage(`${next.url}/boundary?name=unauthorized`)
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     boundary/
     layout.tsx
     unauthorized.tsx"
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
     "app/
     layout.tsx
     search/
     layout.tsx
     loading.tsx"
    `)
  })

  it('should show the custom error boundary when present', async () => {
    const browser = await next.browser('/runtime-error/boundary')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     runtime-error / boundary/
     error.tsx"
    `)
  })

  it('should display parallel routes default page when present', async () => {
    const browser = await next.browser('/parallel-default/subroute')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     layout.tsx
     parallel-default/
     layout.tsx
     default.tsx
     @bar/
     layout.tsx
     subroute/
     page.tsx
     @foo/
     default.tsx"
    `)
  })
})
