/* eslint-env jest */
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { check, getBrowserBodyText, getReactErrorOverlayContent } from 'next-test-utils'

export default (context, renderViaHTTP) => {
  describe('Hot Module Reloading', () => {
    describe('delete a page and add it back', () => {
      it('should detect the changes to typescript pages and display it', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/hello')
          await check(() => getBrowserBodyText(browser), /Hello World/)

          const pagePath = join(context.appDir, 'components', 'hello.ts')

          const originalContent = readFileSync(pagePath, 'utf8')
          const editedContent = originalContent.replace('Hello', 'COOL page')

          // change the content
          writeFileSync(pagePath, editedContent, 'utf8')

          await check(() => getBrowserBodyText(browser), /COOL page/)

          // add the original content
          writeFileSync(pagePath, originalContent, 'utf8')

          await check(() => getBrowserBodyText(browser), /Hello World/)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    it('should recover from a type error', async () => {
      let browser
      const pagePath = join(context.appDir, 'pages/type-error-recover.tsx')
      const origContent = readFileSync(pagePath, 'utf8')
      try {
        browser = await webdriver(context.appPort, '/type-error-recover')
        const errContent = origContent.replace('() =>', '(): boolean =>')

        writeFileSync(pagePath, errContent)
        await check(() => getReactErrorOverlayContent(browser), /Type 'Element' is not assignable to type 'boolean'/)

        writeFileSync(pagePath, origContent)
        await check(async () => {
          const html = await browser.eval('document.documentElement.innerHTML')
          return html.match(/iframe/) ? 'fail' : 'success'
        }, /success/)
      } finally {
        if (browser) browser.close()
        writeFileSync(pagePath, origContent)
      }
    })
  })
}
