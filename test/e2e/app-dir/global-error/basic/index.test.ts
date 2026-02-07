import { nextTestSetup } from 'e2e-utils'

describe('app dir - global-error', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should trigger error component when an error happens during rendering', async () => {
    const browser = await next.browser('/client')
    await browser
      .waitForElementByCss('#error-trigger-button')
      .elementByCss('#error-trigger-button')
      .click()

    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Client error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/client/page.js (8:11) @ Page
       >  8 |     throw new Error('Client error')
            |           ^",
         "stack": [
           "Page app/client/page.js (8:11)",
         ],
       }
      `)
    }
    expect(await browser.elementByCss('#error').text()).toBe(
      'Global error: Client error'
    )
  })

  it('should render global error for error in server components', async () => {
    const browser = await next.browser('/rsc')
    expect(await browser.elementByCss('h1').text()).toBe('Global Error')

    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "server page error",
         "environmentLabel": "Server",
         "label": "Runtime Error",
         "source": "app/rsc/page.js (2:9) @ page
       > 2 |   throw new Error('server page error')
           |         ^",
         "stack": [
           "page app/rsc/page.js (2:9)",
         ],
       }
      `)
    }
    // Show original error message in dev mode, but hide with the react fallback RSC error message in production mode
    expect(await browser.elementByCss('#error').text()).toBe(
      isNextDev
        ? 'Global error: server page error'
        : 'Global error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
    )
    expect(await browser.elementByCss('#digest').text()).toMatch(/\w+/)
  })

  it('should render global error for error in client components during SSR', async () => {
    const browser = await next.browser('/ssr')

    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "client page error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/ssr/page.js (4:9) @ page
       > 4 |   throw new Error('client page error')
           |         ^",
         "stack": [
           "page app/ssr/page.js (4:9)",
         ],
       }
      `)
    }
    expect(await browser.elementByCss('h1').text()).toBe('Global Error')
    expect(await browser.elementByCss('#error').text()).toBe(
      'Global error: client page error'
    )

    expect(await browser.hasElementByCssSelector('#digest')).toBeFalsy()
  })

  it('should catch metadata error in error boundary if presented', async () => {
    const browser = await next.browser('/metadata-error-with-boundary')

    expect(await browser.elementByCss('#error').text()).toBe(
      'Local error boundary'
    )
    expect(await browser.hasElementByCssSelector('#digest')).toBeFalsy()
  })

  it('should catch metadata error in global-error if no error boundary is presented', async () => {
    const browser = await next.browser('/metadata-error-without-boundary')

    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Metadata error",
         "environmentLabel": "Server",
         "label": "Runtime Error",
         "source": "app/metadata-error-without-boundary/page.js (4:9) @ Module.generateMetadata
       > 4 |   throw new Error('Metadata error')
           |         ^",
         "stack": [
           "Module.generateMetadata app/metadata-error-without-boundary/page.js (4:9)",
         ],
       }
      `)
    }
    expect(await browser.elementByCss('h1').text()).toBe('Global Error')
    expect(await browser.elementByCss('#error').text()).toBe(
      isNextDev
        ? 'Global error: Metadata error'
        : 'Global error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
    )
  })

  it('should catch the client error thrown in the nested routes', async () => {
    const browser = await next.browser('/nested/nested')
    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "nested error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/nested/nested/page.js (15:11) @ ClientPage
       > 15 |     throw Error('nested error')
            |           ^",
         "stack": [
           "ClientPage app/nested/nested/page.js (15:11)",
         ],
       }
      `)
    }
    expect(await browser.elementByCss('h1').text()).toBe('Global Error')
    expect(await browser.elementByCss('#error').text()).toBe(
      'Global error: nested error'
    )
  })
})
