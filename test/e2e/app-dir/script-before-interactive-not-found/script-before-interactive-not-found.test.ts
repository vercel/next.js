import { nextTestSetup } from 'e2e-utils'

declare global {
  interface Window {
    executedScripts?: string[]
  }
}

describe('Script component with beforeInteractive strategy and notFound()', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should run beforeInteractive scripts in order on a normal page', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#home')

    expect(await browser.eval(() => window.executedScripts)).toEqual([
      'layout-external',
      'layout-inline',
    ])
  })

  it('should run beforeInteractive scripts in order when a page calls notFound()', async () => {
    const res = await next.fetch('/missing')
    expect(res.status).toBe(404)

    const browser = await next.browser('/missing')
    await browser.waitForElementByCss('#not-found')

    expect(await browser.eval(() => window.executedScripts)).toEqual([
      'layout-external',
      'layout-inline',
      'not-found-inline',
    ])
  })

  it('should run beforeInteractive scripts in order for an unmatched route', async () => {
    const browser = await next.browser('/does-not-exist')
    await browser.waitForElementByCss('#not-found')

    expect(await browser.eval(() => window.executedScripts)).toEqual([
      'layout-external',
      'layout-inline',
      'not-found-inline',
    ])
  })

  it('should not run beforeInteractive scripts again after navigating away from a page that called notFound()', async () => {
    const browser = await next.browser('/missing')
    await browser.waitForElementByCss('#not-found')

    await browser.elementByCss('#to-home').click()
    await browser.waitForElementByCss('#home')

    expect(await browser.eval(() => window.executedScripts)).toEqual([
      'layout-external',
      'layout-inline',
      'not-found-inline',
    ])
  })
})
