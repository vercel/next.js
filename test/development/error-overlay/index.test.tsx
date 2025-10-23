import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox } from 'next-test-utils'

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

    await assertHasRedbox(browser)
    await browser.waitForIdleNetwork()

    // Verify woff2 files were requested and loaded successfully
    expect(woff2Requests.length).toBeGreaterThan(0)
    for (const request of woff2Requests) {
      expect(request.status).toBe(200)
    }
  })

  it('should load dev overlay styles successfully', async () => {
    const browser = await next.browser('/hydration-error')

    await assertHasRedbox(browser)
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
