/* eslint-env jest */

import path from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = path.join(__dirname, '..')
let app
let port

describe('Handles an Error in _error', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    port = await findPort()
    app = await nextStart(appDir, port)
  })
  afterAll(() => killApp(app))

  it('Handles error during SSR', async () => {
    const html = await renderViaHTTP(port, '/some-404-page')
    expect(html).toMatch(/internal server error/i)
  })

  it('Handles error during client transition', async () => {
    const browser = await webdriver(port, '/')
    await browser.waitForElementByCss('a').click()
    await waitFor(1000)
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/internal server error/i)
  })
})
