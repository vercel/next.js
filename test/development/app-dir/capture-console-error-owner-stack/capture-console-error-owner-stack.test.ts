import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, assertNoConsoleErrors } from 'next-test-utils'

const isNewOverlay = process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY !== 'false'

describe('app-dir - capture-console-error-owner-stack', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should capture browser console error and format the error message', async () => {
    const browser = await next.browser('/browser/event')
    await browser.elementByCss('button').click()

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "count": 1,
       "description": "trigger an console <error>",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/browser/event/page.js (7:17) @ onClick
     >  7 |         console.error('trigger an console <%s>', 'error')
          |                 ^",
       "stack": [
         "onClick app/browser/event/page.js (7:17)",
         "button <anonymous> (0:0)",
         "Page app/browser/event/page.js (5:5)",
       ],
     }
    `)
  })

  it('should capture browser console error in render and dedupe if necessary', async () => {
    const browser = await next.browser('/browser/render')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "count": 1,
       "description": "trigger an console.error in render",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/browser/render/page.js (4:11) @ Page
     > 4 |   console.error('trigger an console.error in render')
         |           ^",
       "stack": [
         "Page app/browser/render/page.js (4:11)",
       ],
     }
    `)
  })

  it('should capture browser console error in render and dedupe when multi same errors logged', async () => {
    const browser = await next.browser('/browser/render')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "count": 1,
       "description": "trigger an console.error in render",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/browser/render/page.js (4:11) @ Page
     > 4 |   console.error('trigger an console.error in render')
         |           ^",
       "stack": [
         "Page app/browser/render/page.js (4:11)",
       ],
     }
    `)
  })

  it('should capture server replay string error from console error', async () => {
    const browser = await next.browser('/ssr')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "count": 1,
       "description": "ssr console error:client",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/ssr/page.js (4:11) @ Page
     > 4 |   console.error(
         |           ^",
       "stack": [
         "Page app/ssr/page.js (4:11)",
       ],
     }
    `)
  })

  it('should capture server replay error instance from console error', async () => {
    const browser = await next.browser('/ssr-error-instance')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "count": 1,
       "description": "Error: page error",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/ssr-error-instance/page.js (4:17) @ Page
     > 4 |   console.error(new Error('page error'))
         |                 ^",
       "stack": [
         "Page app/ssr-error-instance/page.js (4:17)",
       ],
     }
    `)
  })

  it('should be able to capture rsc logged error', async () => {
    const browser = await next.browser('/rsc')

    if (isNewOverlay) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "count": 1,
         "description": "Error: boom",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/rsc/page.js (2:17) @ Page
       > 2 |   console.error(new Error('boom'))
           |                 ^",
         "stack": [
           "Page app/rsc/page.js (2:17)",
           "JSON.parse <anonymous> (0:0)",
           "Page <anonymous> (0:0)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "count": 1,
         "description": "[ Server ] Error: boom",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/rsc/page.js (2:17) @ Page
       > 2 |   console.error(new Error('boom'))
           |                 ^",
         "stack": [
           "Page app/rsc/page.js (2:17)",
           "JSON.parse <anonymous> (0:0)",
           "Page <anonymous> (0:0)",
         ],
       }
      `)
    }
  })

  it('should display the error message in error event when event.error is not present', async () => {
    const browser = await next.browser('/browser/error-event')
    await browser.elementByCss('button').click()

    await assertNoRedbox(browser)
    await assertNoConsoleErrors(browser)
  })
})
