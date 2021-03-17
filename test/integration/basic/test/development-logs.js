/* eslint-env jest */
import webdriver from 'next-webdriver'

export default (context) => {
  describe('Development Logs', () => {
    it('should warn when prefetch is true', async () => {
      let browser
      try {
        browser = await webdriver(context.appPort, '/development-logs')
        const browserLogs = await browser.log('browser')
        let foundLog = false
        browserLogs.forEach((log) => {
          if (log.message.includes('Next.js auto-prefetches automatically')) {
            foundLog = true
          }
        })
        expect(foundLog).toBe(true)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
    it('should not warn when prefetch is false', async () => {
      let browser
      try {
        browser = await webdriver(
          context.appPort,
          '/development-logs/link-with-prefetch-false'
        )
        const browserLogs = await browser.log('browser')
        let found = false
        browserLogs.forEach((log) => {
          if (log.message.includes('Next.js auto-prefetches automatically')) {
            found = true
          }
        })
        expect(found).toBe(false)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
    it('should not warn when prefetch is not specified', async () => {
      let browser
      try {
        browser = await webdriver(
          context.appPort,
          '/development-logs/link-with-no-prefetch'
        )
        const browserLogs = await browser.log('browser')
        let found = false
        browserLogs.forEach((log) => {
          if (log.message.includes('Next.js auto-prefetches automatically')) {
            found = true
          }
        })
        expect(found).toBe(false)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
}
