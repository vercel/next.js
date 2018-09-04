/* global describe, it, expect
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { renderViaHTTP, waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'

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
      const browser = await webdriver(context.appPort, '/\',document.body.innerHTML="HACKED",\'')
      // Wait 5 secs to make sure we load all the client side JS code
      await waitFor(5000)

      const bodyText = await browser
        .elementByCss('body').text()

      if (/HACKED/.test(bodyText)) {
        throw new Error('Vulnerable to XSS attacks')
      }

      browser.close()
    })

    it('CSP should load without violations', async () => {
      const browser = await webdriver(context.appPort, '/404/')
      const errLog = await browser.log('browser')
      expect(errLog.filter((e) => e.source === 'security')).toEqual([])
      browser.close()
    })

    it('CSP should fail when violations', async () => {
      const browser = await webdriver(context.appPort, '/violation')
      const errLog = await browser.log('browser')
      expect(errLog.filter((e) => e.source === 'security')[0].level).toEqual('SEVERE')
      browser.close()
    })

    it('properly applies CSP nonce', async () => {
      const browser = await webdriver(context.appPort, '/')
      const nonce = await browser.elementByCss('meta[property="csp-nonce"]').getAttribute('content')
      expect(nonce).toMatch(/\w+=/)
      browser.close()
    })
  })
}
