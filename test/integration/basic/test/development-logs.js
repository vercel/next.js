/* eslint-env jest */
import webdriver from 'next-webdriver'

export default (context) => {
  async function getLogs$(path) {
    let foundLog = false
    let browser
    try {
      browser = await webdriver(context.appPort, path)
      const browserLogs = await browser.log('browser')

      browserLogs.forEach((log) => {
        if (log.message.includes('Next.js auto-prefetches automatically')) {
          foundLog = true
        }
      })
    } finally {
      if (browser) {
        await browser.close()
      }
    }
    return foundLog
  }
  describe('Development Logs', () => {
    it('should warn when prefetch is true', async () => {
      const foundLog = await getLogs$('/development-logs')
      expect(foundLog).toBe(true)
    })
    it('should not warn when prefetch is false', async () => {
      const foundLog = await getLogs$(
        '/development-logs/link-with-prefetch-false'
      )
      expect(foundLog).toBe(false)
    })
    it('should not warn when prefetch is not specified', async () => {
      const foundLog = await getLogs$('/development-logs/link-with-no-prefetch')
      expect(foundLog).toBe(false)
    })
  })
}
