/* eslint-env jest */
/* global jasmine, test */
import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import fetch from 'node-fetch'

const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const context = {}

describe('Lambdas', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    context.appPort = appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  it('should render the page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Hello World/)
  })

  it('should render correctly when importing isomorphic-unfetch', async () => {
    const url = `http://localhost:${appPort}/fetch`
    const res = await fetch(url)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.includes('failed')).toBe(false)
  })

  it('should render correctly when importing isomorphic-unfetch on the client side', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      const text = await browser
        .elementByCss('a').click()
        .waitForElementByCss('.fetch-page')
        .elementByCss('#text').text()

      expect(text).toMatch(/fetch page/)
    } finally {
      browser.close()
    }
  })
})
