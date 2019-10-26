/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe.skip('AMP Bind Initial Data', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(server))

  it('responds with json with accept header on page', async () => {
    const data = await fetchViaHTTP(appPort, '/', null, {
      headers: {
        accept: 'application/amp.bind+json'
      }
    }).then(res => res.ok && res.text())

    let isJSON = false
    try {
      JSON.parse(data)
      isJSON = true
    } catch (_) {}
    expect(isJSON).toBe(true)
  })

  it('renders the data during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/The uptime of the server is.*?\d.*?\d/)
  })

  it('renders a page without data', async () => {
    const html = await renderViaHTTP(appPort, '/about')
    expect(html).toMatch(/<a.*?home/)
  })

  it('navigates to a page with data correctly', async () => {
    const browser = await webdriver(appPort, '/about')
    await browser.elementByCss('a').click()
    await browser.waitForElementByCss('h1')
    const h1Text = await browser.elementByCss('h1').text()
    expect(h1Text).toMatch(/The uptime of the server is.*?\d.*?\d/)
    await browser.close()
  })
})
