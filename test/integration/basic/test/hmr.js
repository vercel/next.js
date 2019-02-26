/* eslint-env jest */
/* global browser */
import { join } from 'path'
import cheerio from 'cheerio'
import { waitFor, check } from 'next-test-utils'
import { getElementText, getComputedCSS, getAttribute } from 'puppet-utils'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'

export default (context, renderViaHTTP) => {
  describe('Hot Module Reloading', () => {
    describe('delete a page and add it back', () => {
      it('should load the page properly', async () => {
        const page = await browser.newPage()
        const contactPagePath = join(__dirname, '../', 'pages', 'hmr', 'contact.js')
        const newContactPagePath = join(__dirname, '../', 'pages', 'hmr', '_contact.js')

        try {
          await page.goto(context.server.getURL('/hmr/contact'))
          await expect(page).toMatchElement('p', { text: 'This is the contact page.' })

          renameSync(contactPagePath, newContactPagePath)

          await check(
            () => getElementText(page, 'body'),
            /This page could not be found/
          )

          // Rename the file back to the original filename
          renameSync(newContactPagePath, contactPagePath)

          // wait until the page comes back
          await check(
            () => getElementText(page, 'body'),
            /This is the contact page/
          )
        } finally {
          if (existsSync(newContactPagePath)) {
            renameSync(newContactPagePath, contactPagePath)
          }
        }
        await page.close()
      })
    })

    describe('editing a page', () => {
      it('should detect the changes and display it', async () => {
        const page = await browser.newPage()

        try {
          await page.goto(context.server.getURL('/hmr/about'))
          await expect(page).toMatchElement('p', { text: 'This is the about page.' })

          const aboutPagePath = join(__dirname, '../', 'pages', 'hmr', 'about.js')

          const originalContent = readFileSync(aboutPagePath, 'utf8')
          const editedContent = originalContent.replace('This is the about page', 'COOL page')

          // change the content
          writeFileSync(aboutPagePath, editedContent, 'utf8')

          await check(
            () => getElementText(page, 'body'),
            /COOL page/
          )

          // add the original content
          writeFileSync(aboutPagePath, originalContent, 'utf8')

          await check(
            () => getElementText(page, 'body'),
            /This is the about page/
          )
        } finally {
          await page.close()
        }
      })

      it('should not reload unrelated pages', async () => {
        const page = await browser.newPage()

        try {
          await page.goto(context.server.getURL('/hmr/counter'))

          await expect(page).toClick('button')
          await expect(page).toClick('button')
          await expect(page).toMatchElement('p', { text: 'COUNT: 2' })

          const aboutPagePath = join(__dirname, '../', 'pages', 'hmr', 'about.js')

          const originalContent = readFileSync(aboutPagePath, 'utf8')
          const editedContent = originalContent.replace('This is the about page', 'COOL page')

          // Change the about.js page
          writeFileSync(aboutPagePath, editedContent, 'utf8')

          // wait for 5 seconds
          await waitFor(5000)

          // Check whether the this page has reloaded or not.
          await expect(page).toMatchElement('p', { text: 'COUNT: 2' })

          // restore the about page content.
          writeFileSync(aboutPagePath, originalContent, 'utf8')
        } finally {
          await page.close()
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles correctly', async () => {
        const page = await browser.newPage()
        try {
          await page.goto(context.server.getURL('/hmr/style'))
          const initialFontSize = await getComputedCSS(page, '.hmr-style-page p', 'font-size')

          expect(initialFontSize).toBe('100px')

          const pagePath = join(__dirname, '../', 'pages', 'hmr', 'style.js')

          const originalContent = readFileSync(pagePath, 'utf8')
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          // wait for 8 seconds
          await waitFor(8000)

          try {
            // Check whether the this page has reloaded or not.
            const editedFontSize = await getComputedCSS(page, '.hmr-style-page p', 'font-size')

            expect(editedFontSize).toBe('200px')
          } finally {
            // Finally is used so that we revert the content back to the original regardless of the test outcome
            // restore the about page content.
            writeFileSync(pagePath, originalContent, 'utf8')
          }
        } finally {
          await page.close()
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles in a stateful component correctly', async () => {
        const page = await browser.newPage()
        const pagePath = join(__dirname, '../', 'pages', 'hmr', 'style-stateful-component.js')
        const originalContent = readFileSync(pagePath, 'utf8')

        try {
          await page.goto(context.server.getURL('/hmr/style-stateful-component'))
          expect(await getComputedCSS(page, '.hmr-style-page p', 'font-size')).toBe('100px')

          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          // wait for 5 seconds
          await waitFor(5000)

          // Check whether the this page has reloaded or not.
          expect(await getComputedCSS(page, '.hmr-style-page p', 'font-size')).toBe('200px')
        } finally {
          await page.close()
          writeFileSync(pagePath, originalContent, 'utf8')
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles in a dynamic component correctly', async () => {
        const page = await browser.newPage()
        const secondPage = await browser.newPage()
        const pagePath = join(__dirname, '../', 'components', 'hmr', 'dynamic.js')
        const originalContent = readFileSync(pagePath, 'utf8')
        try {
          await page.goto(context.server.getURL('/hmr/style-dynamic-component'))

          const initialClientClassName = await getAttribute(page, '#dynamic-component', 'class')
          const initialFontSize = await getComputedCSS(page, '#dynamic-component', 'font-size')

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

          await secondPage.goto(context.server.getURL('/hmr/style-dynamic-component'))
          // Check whether the this page has reloaded or not.
          const editedClientClassName = await getAttribute(secondPage, '#dynamic-component', 'class')
          const editedFontSize = await getComputedCSS(secondPage, '#dynamic-component', 'font-size')
          const browserHtml = await secondPage.evaluate(() => document.querySelector('html').innerHTML)

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

          await page.close()
          await secondPage.close()
        }
      })
    })
  })
}
