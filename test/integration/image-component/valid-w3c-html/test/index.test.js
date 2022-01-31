/* eslint-env jest */

import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import validateHTML from 'html-validator'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let app
let browser

describe('Image Component Valid W3C HTML', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    browser = await webdriver(appPort, '/')
  })
  afterAll(() => {
    killApp(app)
    browser = null
  })

  it('should be vaild W3C HTML', async () => {
    await waitFor(1000)
    expect(await browser.hasElementByCssSelector('img')).toBeTruthy()
    const url = await browser.url()
    const result = await validateHTML({
      url,
      format: 'json',
      isLocal: true,
    })
    expect(result.messages).toEqual([])
  })
})
