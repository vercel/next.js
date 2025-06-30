import { nextTestSetup } from 'e2e-utils'
import { openDevToolsIndicatorPopover } from 'next-test-utils'
import { Playwright } from 'next-webdriver'

async function getSegmentExplorerContent(browser: Playwright) {
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

describe('segment-explorer - globals', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show global-error segment', async () => {
    const browser = await next.browser('/runtime-error')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     global-error.tsx"
    `)
  })

  it('should display parallel routes default page when present', async () => {
    const browser = await next.browser('/404-not-found')
    expect(await getSegmentExplorerContent(browser)).toMatchInlineSnapshot(`
     "app/
     global-not-found.tsx"
    `)
  })
})
