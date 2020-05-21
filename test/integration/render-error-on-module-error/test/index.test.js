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

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')

let appPort
let app
let server

describe('Module Init Error', () => {
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

  it('should render error page', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      await waitFor(2000)
      const text = await browser.elementByCss('#error-p').text()
      expect(text).toBe('Error Rendered')
    } finally {
      await browser.close()
    }
  })
})
