import { nextTestSetup } from 'e2e-utils'
import { openDevToolsIndicatorPopover } from 'next-test-utils'

describe('segment-explorer', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the segment explorer', async () => {
    const browser = await next.browser('/parallel-routes')

    // open the devtool button
    await openDevToolsIndicatorPopover(browser)

    // open the segment explorer
    await browser.elementByCss('[data-segment-explorer]').click()

    //  wait for the segment explorer to be visible
    await browser.waitForElementByCss('[data-nextjs-devtool-segment-explorer]')

    const content = await browser.elementByCss(
      '[data-nextjs-devtool-segment-explorer]'
    )
    expect(await content.text()).toMatchInlineSnapshot(`
     "app/layout.tsx
     app/parallel-routes/layout.tsx
     app/parallel-routes/page.tsx
     app/parallel-routes/@bar/layout.tsx
     app/parallel-routes/@bar/page.tsx
     app/parallel-routes/@foo/layout.tsx
     app/parallel-routes/@foo/page.tsx"
    `)
  })
})
