/* eslint-env jest */
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { check } from 'next-test-utils'

export default (context, render) => {
  const appFile = createFile(join(__dirname, '../', 'pages', '_app.js'))
  const documentFile = createFile(
    join(__dirname, '../', 'pages', '_document.js')
  )
  describe('Client side', () => {
    it('should detect the changes to pages/_app.js and display it', async () => {
      let browser
      try {
        browser = await webdriver(context.appPort, '/')
        writeFileSync(appFile.path, appFile.originalContent, 'utf8')
        await check(
          () => browser.elementByCss('#hello-hmr').text(),
          /Hello HMR/
        )

        // change the content
        const editedContent = appFile.originalContent.replace(
          'Hello HMR',
          'Hi HMR'
        )
        writeFileSync(appFile.path, editedContent, 'utf8')

        await check(() => browser.elementByCss('body').text(), /Hi HMR/)

        // add the original content
        writeFileSync(appFile.path, appFile.originalContent, 'utf8')

        await check(() => browser.elementByCss('body').text(), /Hello HMR/)
      } finally {
        writeFileSync(appFile.path, appFile.originalContent, 'utf8')
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should detect the changes to pages/_document.js and display it', async () => {
      let browser
      try {
        browser = await webdriver(context.appPort, '/')
        writeFileSync(documentFile.path, documentFile.originalContent, 'utf8')
        await check(
          () => browser.elementByCss('#hello-hmr').text(),
          /Hello HMR/
        )

        const editedContent = documentFile.originalContent.replace(
          'Hello Document HMR',
          'Hi Document HMR'
        )

        // change the content
        writeFileSync(documentFile.file, editedContent, 'utf8')

        await check(
          () => browser.elementByCss('body').text(),
          /Hi Document HMR/
        )

        // add the original content
        writeFileSync(documentFile.file, documentFile.originalContent, 'utf8')

        await check(
          () => browser.elementByCss('body').text(),
          /Hello Document HMR/
        )
      } finally {
        writeFileSync(documentFile.file, documentFile.originalContent, 'utf8')
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should keep state between page navigations', async () => {
      const browser = await webdriver(context.appPort, '/')

      const randomNumber = await browser.elementByCss('#random-number').text()

      const switchedRandomNumer = await browser
        .elementByCss('#about-link')
        .click()
        .waitForElementByCss('.page-about')
        .elementByCss('#random-number')
        .text()

      expect(switchedRandomNumer).toBe(randomNumber)
      await browser.close()
    })

    it('It should share module state with pages', async () => {
      const browser = await webdriver(context.appPort, '/shared')

      const text = await browser.elementByCss('#currentstate').text()
      expect(text).toBe('UPDATED CLIENT')
      await browser.close()
    })
  })
}

function createFile(path) {
  return {
    path,
    originalContent: readFileSync(path, 'utf8'),
  }
}
