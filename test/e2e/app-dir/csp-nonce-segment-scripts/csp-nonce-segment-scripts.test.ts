import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('csp-nonce-segment-scripts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The loading and template files import a client component that the page
  // also imports, so their chunk is not already loaded by a layout or by a
  // client reference, and it gets a script tag of its own.
  it('should add the nonce to the script tags of loading and template files', async () => {
    const $ = await next.render$('/with-boundaries')

    const scripts = $('script[src]')
      .toArray()
      .map((element) => ({
        src: $(element).attr('src'),
        nonce: $(element).attr('nonce'),
      }))

    expect(scripts.length).toBeGreaterThan(0)
    expect(scripts.filter((script) => script.nonce !== 'test-nonce')).toEqual(
      []
    )
  })

  it('should run the client code without CSP violations', async () => {
    const browser = await next.browser('/with-boundaries')

    await browser.waitForElementByCss('#page-only[data-hydrated="true"]')
    await browser.elementByCss('#page-only').click()
    await retry(async () => {
      expect(await browser.elementByCss('#page-only').text()).toBe('1')
    })

    if (global.browserName === 'chrome') {
      const logs = await browser.log()
      const cspViolations = logs.filter((log) =>
        log.message.includes('Content Security Policy')
      )
      expect(cspViolations).toEqual([])
    }
  })
})
