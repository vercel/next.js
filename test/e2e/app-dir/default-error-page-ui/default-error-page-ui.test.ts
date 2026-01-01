import { nextTestSetup } from 'e2e-utils'

describe('app dir - default error page UI', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should render the redesigned default error page with all UI elements', async () => {
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

    // In production mode, verify the new error page UI elements

    // Check that the SVG icon is present
    const svgIcon = await browser.elementByCss('svg')
    expect(await svgIcon.getAttribute('width')).toBe('48')
    expect(await svgIcon.getAttribute('height')).toBe('48')

    // Check the error title
    const title = await browser.elementByCss('h1')
    expect(await title.text()).toBe('An Error Occurred')

    // Check the error message
    const message = await browser.elementByCss('p')
    expect(await message.text()).toContain('Something went wrong')

    // Check the "Try Again" button exists
    const button = await browser.elementByCss('button')
    expect(await button.text()).toBe('Try Again')

    // Check the developer hint
    const html = await browser.html()
    expect(html).toContain('Developers:')
    expect(html).toContain('browser console')
  })

  it('should reload the page when Try Again button is clicked', async () => {
    const browser = await next.browser('/trigger-error')

    // Trigger a client-side error
    await browser.elementByCss('#trigger-error').click()

    // Skip in dev mode (redbox overlay)
    if (isNextDev) {
      return
    }

    // Get the current URL
    const urlBefore = await browser.url()

    // Click the Try Again button
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

    // Check that the title has red color
    const title = await browser.elementByCss('h1')
    const titleColor = await title.getComputedCss('color')
    // #dc2626 = rgb(220, 38, 38)
    expect(titleColor).toContain('220')
    expect(titleColor).toContain('38')

    // Check that the button has red background
    const button = await browser.elementByCss('button')
    const buttonBg = await button.getComputedCss('background-color')
    expect(buttonBg).toContain('220')
    expect(buttonBg).toContain('38')
  })

  it('should display Error ID for server-side errors', async () => {
    const browser = await next.browser('/server-error')

    // Skip in dev mode (redbox overlay)
    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Test server error",
         "environmentLabel": "Server",
         "label": "Runtime Error",
         "source": "app/server-error/page.js (2:9) @ ServerErrorPage
       > 2 |   throw new Error('Test server error')
           |         ^",
         "stack": [
           "ServerErrorPage app/server-error/page.js (2:9)",
         ],
       }
      `)
      return
    }

    // In production mode, verify the error page shows Error ID
    const html = await browser.html()
    expect(html).toContain('Error ID:')
    expect(html).toContain('server logs')
  })

  it('should show correct developer hint based on error type', async () => {
    // Client-side error should mention "browser console"
    const clientBrowser = await next.browser('/trigger-error')
    await clientBrowser.elementByCss('#trigger-error').click()

    if (!isNextDev) {
      const clientHtml = await clientBrowser.html()
      expect(clientHtml).toContain('browser console')
    }

    // Server-side error should mention "server logs"
    const serverBrowser = await next.browser('/server-error')

    if (!isNextDev) {
      const serverHtml = await serverBrowser.html()
      expect(serverHtml).toContain('server logs')
    }
  })
})
