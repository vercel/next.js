/* global describe, it, expect */
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { waitFor, check } from 'next-test-utils'

export default (context, render) => {
  describe('Hot Module Reloading', () => {
    describe('delete a page and add it back', () => {
      it('should load the page properly', async () => {
        const browser = await webdriver(context.appPort, '/hmr/contact')
        const text = await browser
          .elementByCss('p').text()
        expect(text).toBe('This is the contact page.')

        const contactPagePath = join(__dirname, '../', 'pages', 'hmr', 'contact.js')
        const newContactPagePath = join(__dirname, '../', 'pages', 'hmr', '_contact.js')

        // Rename the file to mimic a deleted page
        renameSync(contactPagePath, newContactPagePath)

        // wait until the 404 page comes
        await check(
          () => browser.elementByCss('body').text(),
          /This page could not be found/
        )

        // Rename the file back to the original filename
        renameSync(newContactPagePath, contactPagePath)

        // wait until the page comes back
        await check(
          () => browser.elementByCss('body').text(),
          /This is the contact page/
        )

        browser.close()
      })
    })

    describe('editing a page', () => {
      it('should detect the changes and display it', async () => {
        const browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser
          .elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        const aboutPagePath = join(__dirname, '../', 'pages', 'hmr', 'about.js')

        const originalContent = readFileSync(aboutPagePath, 'utf8')
        const editedContent = originalContent.replace('This is the about page', 'COOL page')

        // change the content
        writeFileSync(aboutPagePath, editedContent, 'utf8')

        await check(
          () => browser.elementByCss('body').text(),
          /COOL page/
        )

        // add the original content
        writeFileSync(aboutPagePath, originalContent, 'utf8')

        await check(
          () => browser.elementByCss('body').text(),
          /This is the about page/
        )

        browser.close()
      })

      it('should not reload unrelated pages', async () => {
        const browser = await webdriver(context.appPort, '/hmr/counter')
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

        browser.close()
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles correctly', async () => {
        const browser = await webdriver(context.appPort, '/hmr/style')
        const pTag = await browser.elementByCss('.hmr-style-page p')
        const initialFontSize = await pTag.getComputedCss('font-size')

        expect(initialFontSize).toBe('100px')

        const pagePath = join(__dirname, '../', 'pages', 'hmr', 'style.js')

        const originalContent = readFileSync(pagePath, 'utf8')
        const editedContent = originalContent.replace('100px', '200px')

        // Change the page
        writeFileSync(pagePath, editedContent, 'utf8')

        // wait for 5 seconds
        await waitFor(5000)

        try {
          // Check whether the this page has reloaded or not.
          const editedPTag = await browser.elementByCss('.hmr-style-page p')
          const editedFontSize = await editedPTag.getComputedCss('font-size')

          expect(editedFontSize).toBe('200px')
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          writeFileSync(pagePath, originalContent, 'utf8')
        }

        browser.close()
      })
    })
  })
}
