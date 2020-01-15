/* eslint-env jest */
/* global jasmine */
import {
  nextBuild,
  nextServer,
  startApp,
  stopApp,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '..')

let appPort
let app
let server

describe('Trailing Space in Query', () => {
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

  it('should have correct query on SSR', async () => {
    const browser = await webdriver(appPort, '/?test=abc%20')
    try {
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toBe('{"test":"abc "}')
    } finally {
      await browser.close()
    }
  })

  it('should have correct query on Router#push', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      await waitFor(2000)
      await browser.eval(
        `window.next.router.push({pathname:'/',query:{abc:'def '}})`
      )
      await waitFor(1000)
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toBe('{"abc":"def "}')
    } finally {
      await browser.close()
    }
  })

  it('should have correct query on simple client-side <Link>', async () => {
    const browser = await webdriver(appPort, '/another')
    try {
      await waitFor(2000)
      await browser.elementByCss('#hello-space').click()
      await waitFor(1000)
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toBe('{"another":"hello "}')
    } finally {
      await browser.close()
    }
  })

  it('should have correct query on complex client-side <Link>', async () => {
    const browser = await webdriver(appPort, '/another')
    try {
      await waitFor(2000)
      await browser.elementByCss('#hello-complex').click()
      await waitFor(1000)
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toBe('{"complex":"yes "}')
    } finally {
      await browser.close()
    }
  })
})
