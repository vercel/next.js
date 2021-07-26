/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
  File,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

let app
let appPort
const appDir = join(__dirname, '../')
const invalidPage = new File(join(appDir, 'pages/invalid.js'))

function runTests(isDev) {
  it('isReady should be true immediately for pages without getStaticProps', async () => {
    const browser = await webdriver(appPort, '/appGip')
    expect(await browser.eval('window.isReadyValues')).toEqual([true])
  })

  it('isReady should be true immediately for pages without getStaticProps, with query', async () => {
    const browser = await webdriver(appPort, '/appGip?hello=world')
    expect(await browser.eval('window.isReadyValues')).toEqual([true])
  })

  it('isReady should be true immediately for getStaticProps page without query', async () => {
    const browser = await webdriver(appPort, '/gsp')
    expect(await browser.eval('window.isReadyValues')).toEqual([true])
  })

  it('isReady should be true after query update for getStaticProps page with query', async () => {
    const browser = await webdriver(appPort, '/gsp?hello=world')
    expect(await browser.eval('window.isReadyValues')).toEqual([false, true])
  })
}

describe('router.isReady with appGip', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      invalidPage.restore()
    })

    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
