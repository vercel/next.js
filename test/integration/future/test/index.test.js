/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  nextBuild,
  nextServer,
  startApp,
  stopApp,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

let appDir = join(__dirname, '../')
let server
let appPort

describe('future.excludeDefaultMomentLocales', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    const app = nextServer({
      dir: appDir,
      dev: false,
      quiet: true,
    })
    server = await startApp(app)
    appPort = server.address().port
    // wait for it to start up:
    await renderViaHTTP(appPort, '/')
  })
  afterAll(() => stopApp(server))

  it('should load momentjs', async () => {
    const browser = await webdriver(appPort, '/')
    await waitFor(5000)
    expect(await browser.elementByCss('h1').text()).toMatch(/current time/i)
    const locales = await browser.eval('moment.locales()')
    expect(locales).toEqual(['en'])
    expect(locales.length).toBe(1)
    await browser.close()
  })
})
