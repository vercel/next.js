import { join } from 'path'
import { createNextDescribe, FileRef } from 'e2e-utils'

createNextDescribe(
  'i18-default-locale-redirect',
  {
    files: {
      pages: new FileRef(join(__dirname, './app/pages')),
      'next.config.js': new FileRef(join(__dirname, './app/next.config.js')),
    },
  },
  ({ next }) => {
    it('should not request a path prefixed with default locale', async () => {
      const browser = await next.browser('/')
      let requestedDefaultLocalePath = false
      browser.on('request', (request: any) => {
        if (new URL(request.url(), 'http://n').pathname === '/en/to-new') {
          requestedDefaultLocalePath = true
        }
      })

      await browser.elementByCss('#to-new').click().waitForElementByCss('#new')
      expect(await browser.elementByCss('#new').text()).toBe('New')
      expect(requestedDefaultLocalePath).toBe(false)
    })

    it('should request a path prefixed with non-default locale', async () => {
      const browser = await next.browser('/')
      let requestedNonDefaultLocalePath = false
      browser.on('request', (request: any) => {
        if (new URL(request.url(), 'http://n').pathname === '/nl/to-new') {
          requestedNonDefaultLocalePath = true
        }
      })

      await browser
        .elementByCss('#to-new-nl')
        .click()
        .waitForElementByCss('#new')
      expect(await browser.elementByCss('#new').text()).toBe('New')
      expect(requestedNonDefaultLocalePath).toBe(true)
    })
  }
)
