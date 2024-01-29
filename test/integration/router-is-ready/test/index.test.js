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
  check,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')
const invalidPage = new File(join(appDir, 'pages/invalid.js'))

const checkIsReadyValues = (browser, expected = []) => {
  return check(async () => {
    const values = JSON.stringify(
      (await browser.eval('window.isReadyValues')).sort()
    )
    return JSON.stringify(expected.sort()) === values ? 'success' : values
  }, 'success')
}

function runTests() {
  it('isReady should be true immediately for getInitialProps page', async () => {
    const browser = await webdriver(appPort, '/gip')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for getInitialProps page with query', async () => {
    const browser = await webdriver(appPort, '/gip?hello=world')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for getServerSideProps page', async () => {
    const browser = await webdriver(appPort, '/gssp')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for getServerSideProps page with query', async () => {
    const browser = await webdriver(appPort, '/gssp?hello=world')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true immediately for auto-export page without query', async () => {
    const browser = await webdriver(appPort, '/auto-export')
    await checkIsReadyValues(browser, [true])
  })

  it('isReady should be true after query update for auto-export page with query', async () => {
    const browser = await webdriver(appPort, '/auto-export?hello=world')
    await checkIsReadyValues(browser, [false, true])
  })

  it('isReady should be true after query update for dynamic auto-export page without query', async () => {
    const browser = await webdriver(appPort, '/auto-export/first')
    await checkIsReadyValues(browser, [false, true])
  })

  it('isReady should be true after query update for dynamic auto-export page with query', async () => {
    const browser = await webdriver(appPort, '/auto-export/first?hello=true')
    await checkIsReadyValues(browser, [false, true])
  })

  it('isReady should be true after query update for getStaticProps page with query', async () => {
    const browser = await webdriver(appPort, '/gsp?hello=world')
    await checkIsReadyValues(browser, [false, true])
  })

  it('isReady should be true immediately for getStaticProps page without query', async () => {
    const browser = await webdriver(appPort, '/gsp')
    await checkIsReadyValues(browser, [true])
  })
}

describe('router.isReady', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      invalidPage.restore()
    })

    runTests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
