import { createNext } from 'e2e-utils'
import { NextInstance } from '../../../lib/next-modes/base'
import { BrowserInterface } from '../../../lib/browsers/base'

describe('Script component with crossOrigin props', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: __dirname,
    })
  })
  afterAll(() => next.destroy())

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
