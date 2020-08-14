/* eslint-env jest */

import { readFileSync, writeFileSync } from 'fs'
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
} from 'next-test-utils'

let appPort
let server
jest.setTimeout(1000 * 60 * 5)

describe('App asPath', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(join(__dirname, '../'), appPort)

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(appPort, '/')])
  })
  afterAll(() => killApp(server))

  it('should not have any changes in asPath after a bundle rebuild', async () => {
    const browser = await webdriver(appPort, '/')
    const appPath = join(__dirname, '../', 'pages', '_app.js')
    const originalContent = readFileSync(appPath, 'utf8')

    const text = await browser.elementByCss('body').text()
    expect(text).toBe(
      '{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }'
    )

    const editedContent = originalContent.replace(
      'find this',
      'replace with this'
    )

    // Change the content to trigger a bundle rebuild
    await writeFileSync(appPath, editedContent, 'utf8')

    // Wait for the bundle rebuild
    await waitFor(5000)

    const newContent = await browser.elementByCss('body').text()
    expect(newContent).toBe(
      '{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }'
    )

    // Change back to the original content
    writeFileSync(appPath, originalContent, 'utf8')
    await browser.close()
  })
})
