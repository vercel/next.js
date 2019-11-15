/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  nextBuild,
  findPort,
  waitFor,
  nextStart,
  killApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = join(__dirname, '../')

let appPort
let app

describe('Polyfills', () => {
  beforeAll(async () => {
    const { stdout, stderr } = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })
    console.log(stdout)
    console.error(stderr)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should alias fetch', async () => {
    const browser = await webdriver(appPort, '/fetch')
    await waitFor(1000)
    const text = await browser.elementByCss('#test-status').text()

    expect(text).toBe('pass')

    await browser.close()
  })
})
