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

    // Check that the SVG icon is present (40x40 size)
    const svgIcon = await browser.elementByCss('svg')
    expect(await svgIcon.getAttribute('width')).toBe('40')
    expect(await svgIcon.getAttribute('height')).toBe('40')

    // Check the error title - client errors show "This page crashed"
    const title = await browser.elementByCss('h1')
    expect(await title.text()).toBe('This page crashed')

    // Check the error message - client errors show "An error occurred while running this page."
    const message = await browser.elementByCss('p')
    expect(await message.text()).toContain('An error occurred while running')

    // Check the "Reload page" button exists
    const buttons = await browser.elementsByCss('button')
    expect(await buttons[0].innerText()).toBe('Reload page')

    // Check "Go back" button exists for client errors
    expect(await buttons[1].innerText()).toBe('Go back')

    // Check the hint text about reloading
    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('Reloading usually fixes this')
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

    // Check that the button has neutral styling (white background with border)
    const button = await browser.elementByCss('button')
    const buttonBg = await button.getComputedCss('background-color')
    // White = rgb(255, 255, 255)
    expect(buttonBg).toContain('255')
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

    // Server errors show "This page failed to load"
    expect(html).toContain('This page failed to load')

    // Server errors show "Error reference:" with digest
    expect(html).toContain('Error reference:')

    // Server errors show hint about server issue
    expect(html).toContain('it may be a server issue')
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
