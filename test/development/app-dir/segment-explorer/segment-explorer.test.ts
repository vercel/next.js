import { nextTestSetup } from 'e2e-utils'
import { openDevToolsIndicatorPopover, retry } from 'next-test-utils'
import { Playwright } from 'next-webdriver'

async function getSegmentExplorerContent(browser: Playwright) {
  // open the devtool button
  await openDevToolsIndicatorPopover(browser)

  // open the segment explorer
  await browser.elementByCss('[data-segment-explorer]').click()

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
     "applayout.tsx
     parallel-routeslayout.tsx
     parallel-routespage.tsx
     @barlayout.tsx
     @barpage.tsx
     @foolayout.tsx
     @foopage.tsx"
    `)
  })

  it('should render the segment explorer for nested routes', async () => {
    const browser = await next.browser('/blog/~/grid')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "applayout.tsx
     (v2)layout.tsx
     (team)layout.tsx
     (overview)layout.tsx
     gridpage.tsx"
    `)
  })

  it('should cleanup on soft navigation', async () => {
    const browser = await next.browser('/soft-navigation/a')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "applayout.tsx
     apage.tsx"
    `)

    await browser.elementByCss('[href="/soft-navigation/b"]').click()
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toContain('Page B')
    })

    // FIXME: Should no longer contain /soft-navigation/a/page.js
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "applayout.tsx
     apage.tsx
     bpage.tsx"
    `)
  })
})
