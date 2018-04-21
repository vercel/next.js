/* global describe, it, expect */
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { waitFor } from 'next-test-utils'

async function check (contentFn, regex) {
  while (true) {
    try {
      const newContent = await contentFn()
      if (regex.test(newContent)) break
      await waitFor(1000)
    } catch (ex) {}
  }
}

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

        await check(
          () => browser.elementByCss('body').text(),
          /Unterminated JSX contents/
        )

        // add the original content
        writeFileSync(aboutPagePath, originalContent, 'utf8')

        await check(
          () => browser.elementByCss('body').text(),
          /This is the about page/
        )

        browser.close()
      })

      it.skip('should show the error on all pages', async () => {
        const aboutPagePath = join(__dirname, '../', 'pages', 'hmr', 'about.js')

        const originalContent = readFileSync(aboutPagePath, 'utf8')
        const erroredContent = originalContent.replace('</div>', 'div')

        // change the content
        writeFileSync(aboutPagePath, erroredContent, 'utf8')

        const browser = await webdriver(context.appPort, '/hmr/contact')

        await check(
          () => browser.elementByCss('body').text(),
          /Unterminated JSX contents/
        )

        // add the original content
        writeFileSync(aboutPagePath, originalContent, 'utf8')

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
    })
  })
}
