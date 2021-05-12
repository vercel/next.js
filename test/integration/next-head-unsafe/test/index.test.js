/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { findPort, killApp, launchApp } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = join(__dirname, '..')
let app
let appPort

const expectedWarning = /You are using next\/head in unsafe ways/

describe('Unsafe next/head usage', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should not warn when using safe patterns', async () => {
    const browser = await webdriver(appPort, '/safe-patterns')
    expect(await browser.eval('window.caughtWarns')).toEqual([])
  })

  it('should warn when using multiple heads', async () => {
    const browser = await webdriver(appPort, '/multiple-heads')
    expect(await browser.eval('window.caughtWarns.join()')).toMatch(
      expectedWarning
    )
  })

  it('should warn when using styles in head', async () => {
    const browser = await webdriver(appPort, '/styles-in-head')
    expect(await browser.eval('window.caughtWarns.join()')).toMatch(
      expectedWarning
    )
  })

  it('should warn when using scripts in head', async () => {
    const browser = await webdriver(appPort, '/scripts-in-head')
    expect(await browser.eval('window.caughtWarns.join()')).toMatch(
      expectedWarning
    )
  })
})
