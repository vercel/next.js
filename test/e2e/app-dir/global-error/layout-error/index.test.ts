import { nextTestSetup } from 'e2e-utils'

describe('app dir - global error - layout error', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should render global error for error in server components', async () => {
    const browser = await next.browser('/')

    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "layout error",
         "environmentLabel": "Server",
         "label": "Runtime Error",
         "source": "app/layout.js (2:9) @ layout
       > 2 |   throw new Error('layout error')
           |         ^",
         "stack": [
           "layout app/layout.js (2:9)",
         ],
       }
      `)
    }

    expect(await browser.elementByCss('h1').text()).toBe('Global Error')
    expect(await browser.elementByCss('#error').text()).toBe(
      isNextDev
        ? 'Global error: layout error'
        : 'Global error: Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
    )
    expect(await browser.elementByCss('#digest').text()).toMatch(/\w+/)
  })
})
