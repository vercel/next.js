/* global describe, it, expect */
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

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
  })
}
