/* eslint-env jest */
/* global browser */
import { join } from 'path'
import { readFileSync } from 'fs'
import { getElementText } from 'puppet-utils'
import { renderViaHTTP, waitFor } from 'next-test-utils'

// Does the same evaluation checking for INJECTED for 15 seconds, triggering every 500ms
async function checkInjected (page) {
  const start = Date.now()
  while (Date.now() - start < 15000) {
    const bodyText = await getElementText(page, 'body')
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
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/\',document.body.innerHTML="INJECTED",\''))
      await checkInjected(page)
      await page.close()
    })

    it('should prevent URI based XSS attacks using single quotes', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL(`/'-(document.body.innerHTML='INJECTED')-'`))
      await checkInjected(page)
      await page.close()
    })

    it('should prevent URI based XSS attacks using double quotes', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL(`/"-(document.body.innerHTML='INJECTED')-"`))
      await checkInjected(page)
      await page.close()
    })

    it('should prevent URI based XSS attacks using semicolons and double quotes', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL(`/;"-(document.body.innerHTML='INJECTED')-"`))
      await checkInjected(page)
      await page.close()
    })

    it('should prevent URI based XSS attacks using semicolons and single quotes', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL(`/;'-(document.body.innerHTML='INJECTED')-'`))
      await checkInjected(page)
      await page.close()
    })

    it('should prevent URI based XSS attacks using src', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL(`/javascript:(document.body.innerHTML='INJECTED')`))
      await checkInjected(page)
      await page.close()
    })

    it('should prevent URI based XSS attacks using querystring', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL(`/?javascript=(document.body.innerHTML='INJECTED')`))
      await checkInjected(page)
      await page.close()
    })

    it('should prevent URI based XSS attacks using querystring and quotes', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL(`/?javascript="(document.body.innerHTML='INJECTED')"`))
      await checkInjected(page)
      await page.close()
    })
  })
}
