import { nextTestSetup } from 'e2e-utils'

describe('app dir - default error page UI', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should render client error page with correct UI elements', async () => {
    const browser = await next.browser('/trigger-error')

    // Trigger a client-side error
    await browser.elementByCss('#trigger-error').click()

    // Skip UI checks in dev mode (redbox overlay covers the error page)
    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Test client error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/trigger-error/page.js (9:11) @ TriggerErrorPage
       >  9 |     throw new Error('Test client error')
            |           ^",
         "stack": [
           "TriggerErrorPage app/trigger-error/page.js (9:11)",
         ],
       }
      `)
      return
    }

    // In production mode, verify the client error page UI elements

    // Check that the SVG icon is present (32x32 size)
    const svgIcon = await browser.elementByCss('svg')
    expect(await svgIcon.getAttribute('width')).toBe('32')
    expect(await svgIcon.getAttribute('height')).toBe('32')

    // Check the error title
    const title = await browser.elementByCss('h1')
    expect(await title.text()).toBe('This page couldn\u2019t load')

    // Check the error message - client errors show "Reload to try again, or go back."
    const message = await browser.elementByCss('p')
    expect(await message.text()).toContain('Reload to try again, or go back')

    // Check the "Reload" button exists
    const buttons = await browser.elementsByCss('button')
    expect(await buttons[0].innerText()).toBe('Reload')

    // Check "Back" button exists for client errors
    expect(await buttons[1].innerText()).toBe('Back')
  })

  it('should reload the page when Reload page button is clicked', async () => {
    const browser = await next.browser('/trigger-error')

    // Trigger a client-side error
    await browser.elementByCss('#trigger-error').click()

    // Skip in dev mode (redbox overlay)
    if (isNextDev) {
      return
    }

    // Get the current URL
    const urlBefore = await browser.url()

    // Click the Reload page button
    await browser.elementByCss('button').click()

    // Wait for page to reload (should be back to the trigger-error page)
    await browser.waitForElementByCss('#trigger-error')

    // Verify we're on the same page
    const urlAfter = await browser.url()
    expect(urlAfter).toBe(urlBefore)

    // Verify the page content is showing (not the error)
    const pageTitle = await browser.elementByCss('h1')
    expect(await pageTitle.text()).toBe('Trigger Error Page')
  })

  it('should have proper styling in the default error page', async () => {
    const browser = await next.browser('/trigger-error')

    // Trigger a client-side error
    await browser.elementByCss('#trigger-error').click()

    // Skip in dev mode
    if (isNextDev) {
      return
    }

    // Check that the title has neutral dark color (not red)
    const title = await browser.elementByCss('h1')
    const titleColor = await title.getComputedCss('color')
    // In light mode: #171717 = rgb(23, 23, 23)
    expect(titleColor).toContain('23')

    // Check that the primary button has dark background
    const button = await browser.elementByCss('button')
    const buttonBg = await button.getComputedCss('background-color')
    // Dark = rgb(23, 23, 23) (#171717)
    expect(buttonBg).toContain('23')
  })

  it('should display server error page with Error reference', async () => {
    const browser = await next.browser('/server-error')

    // Skip in dev mode (redbox overlay)
    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Test server error",
         "environmentLabel": "Server",
         "label": "Runtime Error",
         "source": "app/server-error/page.js (6:9) @ ServerErrorContent
       > 6 |   throw new Error('Test server error')
           |         ^",
         "stack": [
           "ServerErrorContent app/server-error/page.js (6:9)",
         ],
       }
      `)
      return
    }

    // In production mode, verify the server error page
    const html = await browser.eval('document.documentElement.innerHTML')

    // Server errors show "This page couldn\u2019t load"
    expect(html).toContain('This page couldn\u2019t load')

    // Server errors show "A server error occurred"
    expect(html).toContain('A server error occurred')

    // Server errors show "ERROR" with digest
    expect(html).toMatch(/ERROR \w+/)
  })

  it('should have left-aligned text in error page', async () => {
    const browser = await next.browser('/trigger-error')

    await browser.elementByCss('#trigger-error').click()

    if (isNextDev) {
      return
    }

    // Check that the h1 has left text alignment
    const title = await browser.elementByCss('h1')
    const textAlign = await title.getComputedCss('text-align')
    expect(textAlign).toBe('left')
  })
})
