/* eslint-env jest */
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderViaHTTP, getBrowserBodyText, waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'

// Does the same evaluation checking for INJECTED for 15 seconds, triggering every 500ms
async function checkInjected (browser) {
  const start = Date.now()
  while (Date.now() - start < 15000) {
    const bodyText = await getBrowserBodyText(browser)
    if (/INJECTED/.test(bodyText)) {
      throw new Error('Vulnerable to XSS attacks')
    }
    await waitFor(500)
  }
}

module.exports = (context) => {
  describe('With Security Related Issues', () => {
    it('should only access files inside .next directory', async () => {
      const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')

      const pathsToCheck = [
        `/_next/${buildId}/page/../../../info`,
        `/_next/${buildId}/page/../../../info.js`,
        `/_next/${buildId}/page/../../../info.json`,
        `/_next/:buildId/webpack/chunks/../../../info.json`,
        `/_next/:buildId/webpack/../../../info.json`,
        `/_next/../../../info.json`,
        `/static/../../../info.json`
      ]

      for (const path of pathsToCheck) {
        const data = await renderViaHTTP(context.appPort, path)
        expect(data.includes('cool-version')).toBeFalsy()
      }
    })

    it('should prevent URI based XSS attacks', async () => {
      const browser = await webdriver(context.appPort, '/\',document.body.innerHTML="INJECTED",\'')
      await checkInjected(browser)
      browser.quit()
    })

    it('should prevent URI based XSS attacks using single quotes', async () => {
      const browser = await webdriver(context.appPort, `/'-(document.body.innerHTML='INJECTED')-'`)
      await checkInjected(browser)
      browser.close()
    })

    it('should prevent URI based XSS attacks using double quotes', async () => {
      const browser = await webdriver(context.appPort, `/"-(document.body.innerHTML='INJECTED')-"`)
      await checkInjected(browser)

      browser.close()
    })

    it('should prevent URI based XSS attacks using semicolons and double quotes', async () => {
      const browser = await webdriver(context.appPort, `/;"-(document.body.innerHTML='INJECTED')-"`)
      await checkInjected(browser)

      browser.close()
    })

    it('should prevent URI based XSS attacks using semicolons and single quotes', async () => {
      const browser = await webdriver(context.appPort, `/;'-(document.body.innerHTML='INJECTED')-'`)
      await checkInjected(browser)

      browser.close()
    })

    it('should prevent URI based XSS attacks using src', async () => {
      const browser = await webdriver(context.appPort, `/javascript:(document.body.innerHTML='INJECTED')`)
      await checkInjected(browser)

      browser.close()
    })

    it('should prevent URI based XSS attacks using querystring', async () => {
      const browser = await webdriver(context.appPort, `/?javascript=(document.body.innerHTML='INJECTED')`)
      await checkInjected(browser)

      browser.close()
    })

    it('should prevent URI based XSS attacks using querystring and quotes', async () => {
      const browser = await webdriver(context.appPort, `/?javascript="(document.body.innerHTML='INJECTED')"`)
      await checkInjected(browser)
      browser.close()
    })
  })
}
