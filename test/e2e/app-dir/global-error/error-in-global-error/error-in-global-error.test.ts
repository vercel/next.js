import { nextTestSetup } from 'e2e-utils'
import { waitForRedbox } from 'next-test-utils'

describe('app dir - global-error - error-in-global-error', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to use nextjs navigation hook in global-error', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('h1').text()
    expect(text).toBe('Custom Global Error')

    if (isNextDev) {
      await waitForRedbox(browser)
      await expect(browser).toDisplayRedbox(`
       {
         "description": "error in page",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/page.js (7:11) @ Page.useEffect
       >  7 |     throw new Error('error in page')
            |           ^",
         "stack": [
           "Page.useEffect app/page.js (7:11)",
         ],
       }
      `)
    }
  })

  it('should render fallback UI when error occurs in global-error', async () => {
    const browser = await next.browser('/?error-in-global-error=1')
    // When the custom global-error throws, it falls back to the default global-error
    // Client errors show "This page crashed"
    const title = await browser.elementByCss('h1').text()
    expect(title).toBe('This page crashed')

    if (isNextDev) {
      await waitForRedbox(browser)
      await expect(browser).toDisplayRedbox(`
       [
         {
           "description": "error in global error",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/global-error.js (10:11) @ InnerGlobalError
       > 10 |     throw new Error('error in global error')
            |           ^",
           "stack": [
             "InnerGlobalError app/global-error.js (10:11)",
             "GlobalError app/global-error.js (26:7)",
           ],
         },
         {
           "description": "error in page",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/page.js (7:11) @ Page.useEffect
       >  7 |     throw new Error('error in page')
            |           ^",
           "stack": [
             "Page.useEffect app/page.js (7:11)",
           ],
         },
       ]
      `)
    }
  })
})
