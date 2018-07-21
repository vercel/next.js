/* global describe, it, expect */

import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { check } from 'next-test-utils'

export default (context, render) => {
  describe('Client side', () => {
    it('should detect the changes to pages/_app.js and display it', async () => {
      const appPath = join(__dirname, '../', 'pages', '_app.js')
      const originalContent = readFileSync(appPath, 'utf8')
      let browser
      try {
        browser = await webdriver(context.appPort, '/')
        const text = await browser.elementByCss('#hello-hmr').text()
        expect(text).toBe('Hello HMR')

        // change the content
        const editedContent = originalContent.replace('Hello HMR', 'Hi HMR')
        writeFileSync(appPath, editedContent, 'utf8')

        await check(
          () => browser.elementByCss('body').text(),
          /Hi HMR/
        )

        // add the original content
        writeFileSync(appPath, originalContent, 'utf8')

        await check(
          () => browser.elementByCss('body').text(),
          /Hello HMR/
        )
      } finally {
        writeFileSync(appPath, originalContent, 'utf8')
        if (browser) {
          browser.close()
        }
      }
    })

    it('should detect the changes to pages/_document.js and display it', async () => {
      const appPath = join(__dirname, '../', 'pages', '_document.js')
      const originalContent = readFileSync(appPath, 'utf8')
      let browser
      try {
        browser = await webdriver(context.appPort, '/')
        const text = await browser
          .elementByCss('#hello-hmr').text()
        expect(text).toBe('Hello HMR')

        const editedContent = originalContent.replace('Hello Document HMR', 'Hi Document HMR')

        // change the content
        writeFileSync(appPath, editedContent, 'utf8')

        await check(
          () => browser.elementByCss('body').text(),
          /Hi Document HMR/
        )

        // add the original content
        writeFileSync(appPath, originalContent, 'utf8')

        await check(
          () => browser.elementByCss('body').text(),
          /Hello Document HMR/
        )
      } finally {
        writeFileSync(appPath, originalContent, 'utf8')
        if (browser) {
          browser.close()
        }
      }
    })

    it('should keep state between page navigations', async () => {
      const browser = await webdriver(context.appPort, '/')

      const randomNumber = await browser.elementByCss('#random-number').text()

      const switchedRandomNumer = await browser
        .elementByCss('#about-link').click()
        .waitForElementByCss('.page-about')
        .elementByCss('#random-number').text()

      expect(switchedRandomNumer).toBe(randomNumber)
      browser.close()
    })

    it('It should share module state with pages', async () => {
      const browser = await webdriver(context.appPort, '/shared')

      const text = await browser.elementByCss('#currentstate').text()
      expect(text).toBe('UPDATED CLIENT')
      browser.close()
    })
  })
}
