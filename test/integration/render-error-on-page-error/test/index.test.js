/* eslint-env jest */

import {
  nextBuild,
  nextServer,
  startApp,
  stopApp,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '..')

let appPort
let app
let server

describe('Render page error with Error.getInitialProps', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  it('should render error page when gssr throws', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      await waitFor(2000)
      // SSR
      let text = await browser.elementByCss('#error-p').text()
      expect(text).toBe('Error Rendered with: server side props error')

      // HYDRATION
      await waitFor(1000)
      text = await browser.elementByCss('#error-p').text()
      expect(text).toBe('Error Rendered with: server side props error')
    } finally {
      await browser.close()
    }
  })

  it('should render error page when render throws', async () => {
    const browser = await webdriver(appPort, '/err')
    try {
      await waitFor(2000)
      // SSR
      let text = await browser.elementByCss('#error-p').text()
      expect(text).toBe('Error Rendered with: server side render error')

      // HYDRATION
      await waitFor(1000)
      text = await browser.elementByCss('#error-p').text()
      expect(text).toBe('Error Rendered with: server side render error')
    } finally {
      await browser.close()
    }
  })
})
