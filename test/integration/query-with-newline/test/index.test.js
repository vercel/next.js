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

describe('New Line in Query', () => {
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
    const browser = await webdriver(appPort, '/?test=abc%0A')
    try {
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toBe('{"test":"abc\\n"}')
    } finally {
      await browser.close()
    }
  })

  it('should have correct query on Router#push', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      await waitFor(2000)
      await browser.eval(
        `window.next.router.push({pathname:'/',query:{abc:'def\\n'}})`
      )
      await waitFor(1000)
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toBe('{"abc":"def\\n"}')
    } finally {
      await browser.close()
    }
  })

  it('should have correct query on simple client-side <Link>', async () => {
    const browser = await webdriver(appPort, '/another')
    try {
      await waitFor(2000)
      await browser.elementByCss('#hello-lf').click()
      await waitFor(1000)
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toBe('{"another":"hello\\n"}')
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
      expect(text).toBe('{"complex":"yes\\n"}')
    } finally {
      await browser.close()
    }
  })
})
