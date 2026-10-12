import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import cheerio from 'cheerio'

describe('csp-nonce-segment-scripts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The loading and template files import a client component that the page
  // also imports, so their chunk is not already loaded by a layout or by a
  // client reference, and it gets a script tag of its own.
  it.each([
    { query: '', cspHeader: 'content-security-policy' },
    {
      query: '?csp=report-only',
      cspHeader: 'content-security-policy-report-only',
    },
  ])(
    'should add the nonce to script tags with $cspHeader',
    async ({ query, cspHeader }) => {
      const response = await next.fetch(`/with-boundaries${query}`)
      expect(response.headers.get(cspHeader)).toContain('nonce-test-nonce')
      if (query) {
        expect(response.headers.get('content-security-policy')).toBeNull()
      }
      const $ = cheerio.load(await response.text())

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
    }
  )

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
