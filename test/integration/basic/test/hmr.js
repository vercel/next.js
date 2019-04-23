/* eslint-env jest */
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { join } from 'path'
import { waitFor, check, getBrowserBodyText } from 'next-test-utils'
import cheerio from 'cheerio'

export default (context, renderViaHTTP) => {
  describe('Hot Module Reloading', () => {
    describe('delete a page and add it back', () => {
      it('should load the page properly', async () => {
        const contactPagePath = join(__dirname, '../', 'pages', 'hmr', 'contact.js')
        const newContactPagePath = join(__dirname, '../', 'pages', 'hmr', '_contact.js')
        let browser
        try {
          browser = await webdriver(context.appPort, '/hmr/contact')
          const text = await browser
            .elementByCss('p').text()
          expect(text).toBe('This is the contact page.')

          // Rename the file to mimic a deleted page
          renameSync(contactPagePath, newContactPagePath)

          await check(
            () => getBrowserBodyText(browser),
            /This page could not be found/
          )

          // Rename the file back to the original filename
          renameSync(newContactPagePath, contactPagePath)

          // wait until the page comes back
          await check(
            () => getBrowserBodyText(browser),
            /This is the contact page/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
          if (existsSync(newContactPagePath)) {
            renameSync(newContactPagePath, contactPagePath)
          }
        }
      })
    })

    describe('editing a page', () => {
      it('should detect the changes and display it', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/hmr/about')
          const text = await browser
            .elementByCss('p').text()
          expect(text).toBe('This is the about page.')

          const aboutPagePath = join(__dirname, '../', 'pages', 'hmr', 'about.js')

          const originalContent = readFileSync(aboutPagePath, 'utf8')
          const editedContent = originalContent.replace('This is the about page', 'COOL page')

          // change the content
          writeFileSync(aboutPagePath, editedContent, 'utf8')

          await check(
            () => getBrowserBodyText(browser),
            /COOL page/
          )

          // add the original content
          writeFileSync(aboutPagePath, originalContent, 'utf8')

          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should detect the changes to typescript pages and display it', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/typescript/hello')
          await check(
            () => getBrowserBodyText(browser),
            /Hello World/
          )

          const pagePath = join(__dirname, '../', 'pages', 'typescript', 'hello.tsx')

          const originalContent = readFileSync(pagePath, 'utf8')
          const editedContent = originalContent.replace('Hello World', 'COOL page')

          // change the content
          writeFileSync(pagePath, editedContent, 'utf8')

          await check(
            () => getBrowserBodyText(browser),
            /COOL page/
          )

          // add the original content
          writeFileSync(pagePath, originalContent, 'utf8')

          await check(
            () => getBrowserBodyText(browser),
            /Hello World/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should not reload unrelated pages', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/hmr/counter')
          const text = await browser
            .elementByCss('button').click()
            .elementByCss('button').click()
            .elementByCss('p').text()
          expect(text).toBe('COUNT: 2')

          const aboutPagePath = join(__dirname, '../', 'pages', 'hmr', 'about.js')

          const originalContent = readFileSync(aboutPagePath, 'utf8')
          const editedContent = originalContent.replace('This is the about page', 'COOL page')

          // Change the about.js page
          writeFileSync(aboutPagePath, editedContent, 'utf8')

          // wait for 5 seconds
          await waitFor(5000)

          // Check whether the this page has reloaded or not.
          const newText = await browser
            .elementByCss('p').text()
          expect(newText).toBe('COUNT: 2')

          // restore the about page content.
          writeFileSync(aboutPagePath, originalContent, 'utf8')
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles correctly', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/hmr/style')
          const pTag = await browser.elementByCss('.hmr-style-page p')
          const initialFontSize = await pTag.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const pagePath = join(__dirname, '../', 'pages', 'hmr', 'style.js')

          const originalContent = readFileSync(pagePath, 'utf8')
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          try {
            // Check whether the this page has reloaded or not.
            await check(
              async () => {
                const editedPTag = await browser.elementByCss('.hmr-style-page p')
                return editedPTag.getComputedCss('font-size')
              },
              /200px/
            )
          } finally {
            // Finally is used so that we revert the content back to the original regardless of the test outcome
            // restore the about page content.
            writeFileSync(pagePath, originalContent, 'utf8')
          }
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles in a stateful component correctly', async () => {
        let browser
        const pagePath = join(__dirname, '../', 'pages', 'hmr', 'style-stateful-component.js')
        const originalContent = readFileSync(pagePath, 'utf8')
        try {
          browser = await webdriver(context.appPort, '/hmr/style-stateful-component')
          const pTag = await browser.elementByCss('.hmr-style-page p')
          const initialFontSize = await pTag.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          // Check whether the this page has reloaded or not.
          await check(
            async () => {
              const editedPTag = await browser.elementByCss('.hmr-style-page p')
              return editedPTag.getComputedCss('font-size')
            },
            /200px/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
          writeFileSync(pagePath, originalContent, 'utf8')
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles in a dynamic component correctly', async () => {
        let browser = null
        let secondBrowser = null
        const pagePath = join(__dirname, '../', 'components', 'hmr', 'dynamic.js')
        const originalContent = readFileSync(pagePath, 'utf8')
        try {
          browser = await webdriver(context.appPort, '/hmr/style-dynamic-component')
          const div = await browser.elementByCss('#dynamic-component')
          const initialClientClassName = await div.getAttribute('class')
          const initialFontSize = await div.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const initialHtml = await renderViaHTTP('/hmr/style-dynamic-component')
          expect(initialHtml.includes('100px')).toBeTruthy()

          const $initialHtml = cheerio.load(initialHtml)
          const initialServerClassName = $initialHtml('#dynamic-component').attr('class')

          expect(initialClientClassName === initialServerClassName).toBeTruthy()

          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          // wait for 5 seconds
          await waitFor(5000)

          secondBrowser = await webdriver(context.appPort, '/hmr/style-dynamic-component')
          // Check whether the this page has reloaded or not.
          const editedDiv = await secondBrowser.elementByCss('#dynamic-component')
          const editedClientClassName = await editedDiv.getAttribute('class')
          const editedFontSize = await editedDiv.getComputedCss('font-size')
          const browserHtml = await secondBrowser.elementByCss('html').getAttribute('innerHTML')

          expect(editedFontSize).toBe('200px')
          expect(browserHtml.includes('font-size:200px;')).toBe(true)
          expect(browserHtml.includes('font-size:100px;')).toBe(false)

          const editedHtml = await renderViaHTTP('/hmr/style-dynamic-component')
          expect(editedHtml.includes('200px')).toBeTruthy()
          const $editedHtml = cheerio.load(editedHtml)
          const editedServerClassName = $editedHtml('#dynamic-component').attr('class')

          expect(editedClientClassName === editedServerClassName).toBe(true)
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          writeFileSync(pagePath, originalContent, 'utf8')

          if (browser) {
            await browser.close()
          }

          if (secondBrowser) {
            secondBrowser.close()
          }
        }
      })
    })
  })
}
