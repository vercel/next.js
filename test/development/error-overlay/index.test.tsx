import { nextTestSetup } from 'e2e-utils'
import { waitForRedbox } from 'next-test-utils'

describe('DevErrorOverlay', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_TELEMETRY_DISABLED: '',
    },
  })

  it('can get error code from RSC error thrown by framework', async () => {
    const browser = await next.browser('/known-rsc-error')

    const errorCode = await browser.elementByCss('[data-nextjs-error-code]')
    const code = await errorCode.getAttribute('data-nextjs-error-code')
    expect(code).toBe('E40')
  })

  it('sends feedback when clicking helpful button', async () => {
    const feedbackRequests: string[] = []
    const browser = await next.browser('/known-client-error', {
      beforePageLoad(page) {
        page.route(/__nextjs_error_feedback/, (route) => {
          const url = new URL(route.request().url())
          feedbackRequests.push(url.pathname + url.search)

          route.fulfill({ status: 204, body: 'No Content' })
        })
      },
    })

    await browser.elementByCss('button').click() // clicked "break on client"
    await browser.getByRole('button', { name: 'Mark as helpful' }).click()

    expect(
      await browser
        .getByRole('region', { name: 'Error feedback' })
        .getByRole('status')
        .textContent()
    ).toEqual('Thanks for your feedback!')
    expect(feedbackRequests).toEqual([
      '/__nextjs_error_feedback?errorCode=E40&wasHelpful=true',
    ])
  })

  it('sends feedback when clicking not helpful button', async () => {
    const feedbackRequests: string[] = []
    const browser = await next.browser('/known-client-error', {
      beforePageLoad(page) {
        page.route(/__nextjs_error_feedback/, (route) => {
          const url = new URL(route.request().url())
          feedbackRequests.push(url.pathname + url.search)

          route.fulfill({ status: 204, body: 'No Content' })
        })
      },
    })

    await browser.elementByCss('button').click() // clicked "break on client"
    await browser.getByRole('button', { name: 'Mark as not helpful' }).click()

    expect(
      await browser
        .getByRole('region', { name: 'Error feedback' })
        .getByRole('status')
        .textContent()
    ).toEqual('Thanks for your feedback!')
    expect(feedbackRequests).toEqual([
      '/__nextjs_error_feedback?errorCode=E40&wasHelpful=false',
    ])
  })

  it('loads fonts successfully', async () => {
    const woff2Requests: { url: string; status: number }[] = []
    const browser = await next.browser('/known-rsc-error', {
      beforePageLoad: (page) => {
        page.route('**/*.woff2', async (route) => {
          const response = await route.fetch()
          woff2Requests.push({
            url: route.request().url(),
            status: response.status(),
          })
          await route.continue()
        })
      },
    })

    await waitForRedbox(browser)
    await browser.waitForIdleNetwork()

    // Verify woff2 files were requested and loaded successfully
    expect(woff2Requests.length).toBeGreaterThan(0)
    for (const request of woff2Requests) {
      expect(request.status).toBe(200)
    }
  })

  it('shows Error.cause in the error overlay', async () => {
    const browser = await next.browser('/error-cause')

    await expect({ browser, next }).toDisplayCollapsedRedbox(`
     {
       "cause": [
         {
           "label": "Caused by: TypeError",
           "message": "Connection refused",
           "source": "app/error-cause/page.tsx (6:16) @ Page
     > 6 |   const root = new TypeError('Connection refused')
         |                ^",
           "stack": [
             "Page app/error-cause/page.tsx (6:16)",
           ],
         },
       ],
       "description": "Database query failed",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/error-cause/page.tsx (7:15) @ Page
     >  7 |   const mid = new Error('Database query failed', { cause: root })
          |               ^",
       "stack": [
         "Page app/error-cause/page.tsx (7:15)",
       ],
     }
    `)
  })

  it('shows nested Error.cause chain in the error overlay', async () => {
    const browser = await next.browser('/error-cause-nested')

    await expect({ browser, next }).toDisplayCollapsedRedbox(`
     {
       "cause": [
         {
           "label": "Caused by: Error",
           "message": "Database query failed",
           "source": "app/error-cause-nested/page.tsx (7:15) @ Page
     >  7 |   const mid = new Error('Database query failed', { cause: root })
          |               ^",
           "stack": [
             "Page app/error-cause-nested/page.tsx (7:15)",
           ],
         },
         {
           "label": "Caused by: TypeError",
           "message": "Connection refused",
           "source": "app/error-cause-nested/page.tsx (6:16) @ Page
     > 6 |   const root = new TypeError('Connection refused')
         |                ^",
           "stack": [
             "Page app/error-cause-nested/page.tsx (6:16)",
           ],
         },
       ],
       "description": "Failed to load user",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/error-cause-nested/page.tsx (8:15) @ Page
     >  8 |   const top = new Error('Failed to load user', { cause: mid })
          |               ^",
       "stack": [
         "Page app/error-cause-nested/page.tsx (8:15)",
       ],
     }
    `)
  })

  it('ignores non-Error cause in the error overlay', async () => {
    const browser = await next.browser('/error-cause-non-error')

    await expect({ browser, next }).toDisplayCollapsedRedbox(`
     {
       "description": "Something went wrong",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/error-cause-non-error/page.tsx (6:15) @ Page
     > 6 |   const err = new Error('Something went wrong', {
         |               ^",
       "stack": [
         "Page app/error-cause-non-error/page.tsx (6:15)",
       ],
     }
    `)
  })

  it('should load dev overlay styles successfully', async () => {
    const browser = await next.browser('/hydration-error')

    await waitForRedbox(browser)
    const redbox = browser.locateRedbox()

    // check the data-nextjs-dialog-header="true" DOM element styles under redbox is applied
    const dialogHeader = redbox.locator('[data-nextjs-dialog-header="true"]')
    expect(await dialogHeader.isVisible()).toBe(true)
    // get computed styles
    const computedStyles = await dialogHeader.evaluate((element) => {
      return window.getComputedStyle(element)
    })
    const styles = {
      backgroundColor: computedStyles.backgroundColor,
      color: computedStyles.color,
    }

    expect(styles).toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      color: 'rgb(117, 117, 117)',
    })
  })
})
