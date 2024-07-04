import { nextTestSetup } from 'e2e-utils'
import { BrowserInterface } from '../../../lib/browsers/base'

describe('Script component with crossOrigin props', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be set crossOrigin also in preload link tag', async () => {
    let browser: BrowserInterface

    try {
      browser = await next.browser('/')

      expect(
        await browser
          .elementByCss(
            'link[href="https://code.jquery.com/jquery-3.7.1.min.js"]'
          )
          .getAttribute('crossorigin')
      ).toBe('use-credentials')
    } finally {
      if (browser) await browser.close()
    }
  })
})
