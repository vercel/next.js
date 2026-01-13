import { nextTestSetup } from 'e2e-utils'

describe('route-page-manifest-bug', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work when loading the child page', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#page-title-home')
    await browser.waitForIdleNetwork()

    expect(await browser.elementById('next-script-layout')).toBeDefined()
    const pageScriptElement = await browser.eval(
      `document.querySelector('script[src*="/_next/static/chunks/app/page"]')`
    )
    expect(pageScriptElement).not.toBeNull()

    // go to child page
    await browser.eval('window.location.href = "/abc"')
    await browser.waitForElementByCss('#page-title-abc')
    await browser.refresh()
    await browser.waitForIdleNetwork()

    expect(await browser.elementById('next-script-layout')).toBeDefined()
    const childPageScriptElement = await browser.eval(
      `document.querySelector('script[src*="/_next/static/chunks/app/abc/page"]')`
    )
    expect(childPageScriptElement).not.toBeNull()
    const parentPageScriptElement = await browser.eval(
      `document.querySelector('script[src*="/_next/static/chunks/app/page"]')`
    )
    expect(parentPageScriptElement).toBeNull()
  })
})
