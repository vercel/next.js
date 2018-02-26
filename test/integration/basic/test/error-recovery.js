/* global describe, it, expect */
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { check } from 'next-test-utils'

class File {
  constructor (path) {
    this.path = path
    this.originalContent = readFileSync(this.path, 'utf8')
  }

  write (content) {
    writeFileSync(this.path, content, 'utf8')
  }

  replace (pattern, newValue) {
    const newContent = this.originalContent.replace(pattern, newValue)
    this.write(newContent)
  }

  restore () {
    this.write(this.originalContent)
  }
}

export default (context, render) => {
  describe('Error Recovery', () => {
    it('should detect syntax errors and recover', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const text = await browser
        .elementByCss('p').text()
      expect(text).toBe('This is the about page.')

      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      aboutPage.replace('</div>', 'div')

      await check(
        () => browser.elementByCss('body').text(),
        /Unterminated JSX contents/
      )

      aboutPage.restore()

      await check(
        () => browser.elementByCss('body').text(),
        /This is the about page/
      )

      browser.close()
    })

    it('should show the error on all pages', async () => {
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      aboutPage.replace('</div>', 'div')

      const browser = await webdriver(context.appPort, '/hmr/contact')

      await check(
        () => browser.elementByCss('body').text(),
        /Unterminated JSX contents/
      )

      aboutPage.restore()

      await check(
        () => browser.elementByCss('body').text(),
        /This is the contact page/
      )

      browser.close()
    })

    it('should detect runtime errors on the module scope', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const text = await browser
        .elementByCss('p').text()
      expect(text).toBe('This is the about page.')

      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      aboutPage.replace('export', 'aa=20;\nexport')

      await check(
        () => browser.elementByCss('body').text(),
        /aa is not defined/
      )

      aboutPage.restore()

      await check(
        () => browser.elementByCss('body').text(),
        /This is the about page/
      )

      browser.close()
    })

    it('should recover from errors in the render function', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const text = await browser
        .elementByCss('p').text()
      expect(text).toBe('This is the about page.')

      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      aboutPage.replace('return', 'throw new Error("an-expected-error");\nreturn')

      await check(
        () => browser.elementByCss('body').text(),
        /an-expected-error/
      )

      aboutPage.restore()

      await check(
        () => browser.elementByCss('body').text(),
        /This is the about page/
      )

      browser.close()
    })

    it('should recover after exporting an invalid page', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const text = await browser
        .elementByCss('p').text()
      expect(text).toBe('This is the about page.')

      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      aboutPage.replace('export default', 'export default "not-a-page"\nexport const fn = ')

      await check(
        () => browser.elementByCss('body').text(),
        /The default export is not a React Component/
      )

      aboutPage.restore()

      await check(
        () => browser.elementByCss('body').text(),
        /This is the about page/
      )

      browser.close()
    })

    it('should recover from errors in getInitialProps in client')
    it('should recover after an error reported via SSR')
    it('should recover from 404 after a page has been added')
  })
}
