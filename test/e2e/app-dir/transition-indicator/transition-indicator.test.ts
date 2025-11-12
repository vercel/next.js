import { nextTestSetup } from 'e2e-utils'

describe('transition-indicator', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // TODO: Find testing pattern to assert that the browser's pending indicator is shown
  // These tests are just instructions for manual testing

  it('displays while loading content without fallback', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('a[href="/slow-without-fallback"]').click()

    // shows pending indicator in browser tab while loading
    // Gets stuck due to usage of history.pushState
  })

  it('does not display while loading content with fallback', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('a[href="/slow-with-fallback"]').click()

    // fallback is shown, no pending indicator in browser tab
  })

  it('displays during any Transition that does not commit a pending state', async () => {
    const browser = await next.browser('/')

    const button = await browser.elementByCss('button')
    await button.click()

    // shows pending indicator in browser tab until increment is committed
  })
})
