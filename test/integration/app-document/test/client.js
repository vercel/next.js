/* eslint-env jest */
import 'testcafe'
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { check } from 'next-test-utils'

export default () => {
  test('should detect the changes to pages/_app.js and display it', async t => {
    const appPath = join(__dirname, '../', 'pages', '_app.js')
    const originalContent = readFileSync(appPath, 'utf8')
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/')
      const text = await browser.elementByCss('#hello-hmr').text()
      await t.expect(text).eql('Hello HMR')

      // change the content
      const editedContent = originalContent.replace('Hello HMR', 'Hi HMR')
      writeFileSync(appPath, editedContent, 'utf8')

      await check(() => browser.elementByCss('body').text(), /Hi HMR/)

      // add the original content
      writeFileSync(appPath, originalContent, 'utf8')

      await check(() => browser.elementByCss('body').text(), /Hello HMR/)
    } finally {
      writeFileSync(appPath, originalContent, 'utf8')
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should detect the changes to pages/_document.js and display it', async t => {
    const appPath = join(__dirname, '../', 'pages', '_document.js')
    const originalContent = readFileSync(appPath, 'utf8')
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/')
      const text = await browser.elementByCss('#hello-hmr').text()
      await t.expect(text).eql('Hello HMR')

      const editedContent = originalContent.replace(
        'Hello Document HMR',
        'Hi Document HMR'
      )

      // change the content
      writeFileSync(appPath, editedContent, 'utf8')

      await check(() => browser.elementByCss('body').text(), /Hi Document HMR/)

      // add the original content
      writeFileSync(appPath, originalContent, 'utf8')

      await check(
        () => browser.elementByCss('body').text(),
        /Hello Document HMR/
      )
    } finally {
      writeFileSync(appPath, originalContent, 'utf8')
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should keep state between page navigations', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/')

    const randomNumber = await browser.elementByCss('#random-number').text()

    await browser.elementByCss('#about-link').click()

    await browser.waitForElementByCss('.page-about')

    const switchedRandomNumer = await browser
      .elementByCss('#random-number')
      .text()

    await t.expect(switchedRandomNumer).eql(randomNumber)
    await browser.close()
  })

  test('It should share module state with pages', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/shared')

    const text = await browser.elementByCss('#currentstate').text()
    await t.expect(text).eql('UPDATED CLIENT')
    await browser.close()
  })
}
