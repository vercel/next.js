/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import path from 'path'
import { nextBuild, nextStart, findPort, killApp } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = path.join(__dirname, '..')
let appPort
let app

describe('Auto Export', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })

  it('Supports commonjs 1', async () => {
    const browser = await webdriver(appPort, '/commonjs1')
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/test1/)
    expect(html).toMatch(/nextExport/)
    await browser.close()
  })

  it('Supports commonjs 2', async () => {
    const browser = await webdriver(appPort, '/commonjs2')
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/test2/)
    expect(html).toMatch(/nextExport/)
    await browser.close()
  })

  it('Refreshes query on mount', async () => {
    const browser = await webdriver(appPort, '/post-1')
    const html = await browser.eval('document.body.innerHTML')
    expect(html).toMatch(/post.*post-1/)
    expect(html).toMatch(/nextExport/)
  })

  afterAll(async () => {
    await killApp(app)
  })
})
