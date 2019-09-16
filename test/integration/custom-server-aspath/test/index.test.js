/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import path from 'path'
import {
  initNextServerScript,
  renderViaHTTP,
  findPort,
  killApp,
  waitFor
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = path.join(__dirname, '../')
let appPort
let server

const context = {}

const startServer = async (optEnv = {}) => {
  const scriptPath = path.join(appDir, 'server.js')
  context.appPort = appPort = await findPort()
  const env = Object.assign({}, process.env, { PORT: `${appPort}` }, optEnv)

  server = await initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/
  )
}

describe('Custom Server asPath handling', () => {
  beforeAll(() => startServer())
  afterAll(() => killApp(server))

  it('should ignore custom asPath for prerendered pages SSR', async () => {
    let html = await renderViaHTTP(appPort, '/a')
    expect(html).toMatch(/Hello.*?\/b/)

    html = await renderViaHTTP(appPort, '/b')
    expect(html).toMatch(/Hello.*?\/a/)
  })

  it('should update asPath for prerendered pages after mount CSR', async () => {
    const browser = await webdriver(appPort, '/a')
    await waitFor(500)
    const asPath = await browser.eval(`window.next.router.asPath`)
    expect(asPath).toBe('/a')
  })

  it('should allow custom asPath for non-prerendered pages', async () => {
    const html = await renderViaHTTP(appPort, '/d')
    expect(html).toMatch(/Hello.*?\/d/)
  })
})
