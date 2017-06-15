/* global describe, it, expect */
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { waitFor } from 'next-test-utils'

export default (context, render) => {
  describe('Hot Module Reloading', () => {
    describe('syntax error', () => {
      it('should detect the error and recover', async () => {
        const browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser
          .elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        const aboutPagePath = join(__dirname, '../', 'pages', 'hmr', 'about.js')

        const originalContent = readFileSync(aboutPagePath, 'utf8')
        const erroredContent = originalContent.replace('</div>', 'div')

        // change the content
        writeFileSync(aboutPagePath, erroredContent, 'utf8')

        const errorMessage = await browser
          .waitForElementByCss('pre')
          .elementByCss('pre').text()
        expect(errorMessage.includes('Unterminated JSX contents')).toBeTruthy()

        // add the original content
        writeFileSync(aboutPagePath, originalContent, 'utf8')

        const newContent = await browser
          .waitForElementByCss('.hmr-about-page')
          .elementByCss('p').text()
        expect(newContent).toBe('This is the about page.')

        browser.close()
      })
    })

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
        while (true) {
          try {
            const pageContent = await browser.elementByCss('body').text()
            if (/This page could not be found/.test(pageContent)) break
          } catch (ex) {}

          await waitFor(1000)
        }

        // Rename the file back to the original filename
        renameSync(newContactPagePath, contactPagePath)

        // wait until the page comes back
        while (true) {
          try {
            const pageContent = await browser.elementByCss('body').text()
            if (/This is the contact page/.test(pageContent)) break
          } catch (ex) {}

          await waitFor(1000)
        }

        browser.close()
      })
    })
  })
}
