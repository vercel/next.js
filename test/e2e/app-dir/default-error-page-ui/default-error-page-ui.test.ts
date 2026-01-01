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

    // Check that the SVG icon is present (40x40 size)
    const svgIcon = await browser.elementByCss('svg')
    expect(await svgIcon.getAttribute('width')).toBe('40')
    expect(await svgIcon.getAttribute('height')).toBe('40')

    // Check the error title
    const title = await browser.elementByCss('h1')
    expect(await title.text()).toBe('Something went wrong')

    // Check the error message
    const message = await browser.elementByCss('p')
    expect(await message.text()).toContain('failed to load')

    // Check the "Reload page" button exists
    const button = await browser.elementByCss('button')
    expect(await button.text()).toBe('Reload page')

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

  it('should display Error reference for server-side errors', async () => {
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

    // In production mode, verify the error page shows Error reference
    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('Error reference:')
    expect(html).toContain('contact support')
  })

  it('should have left-aligned text inside centered container', async () => {
    const browser = await next.browser('/trigger-error')

    await browser.elementByCss('#trigger-error').click()

    if (isNextDev) {
      return
    }

    // Check that the card has left text alignment
    const card = await browser.elementByCss('.next-error-card')
    const textAlign = await card.getComputedCss('text-align')
    expect(textAlign).toBe('left')
  })
})
