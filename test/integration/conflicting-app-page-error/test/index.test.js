/* eslint-env jest */

import path from 'path'
import {
  killApp,
  findPort,
  getRedboxHeader,
  hasRedbox,
  launchApp,
  nextBuild,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

let app
let appPort
const appDir = path.join(__dirname, '..')
let output = ''

function runTests({ dev }) {
  it('should print error for conflicting app/page', async () => {
    expect(output).toMatch(/Conflicting app and page files were found/)

    for (const [pagePath, appPath] of [
      ['pages/index.js', 'app/page.js'],
      ['pages/hello.js', 'app/hello/page.js'],
      ['pages/another.js', 'app/another/page.js'],
    ]) {
      expect(output).toContain(`"${pagePath}" - "${appPath}"`)
    }
    expect(output).not.toContain('/non-conflict-pages')
    expect(output).not.toContain('/non-conflict')
  })

  if (dev) {
    it('should show error overlay for /', async () => {
      const browser = await webdriver(appPort, '/')
      expect(await hasRedbox(browser, true)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        'Conflicting app and page file found: "app/page.js" and "pages/index.js". Please remove one to continue.'
      )
    })

    it('should show error overlay for /hello', async () => {
      const browser = await webdriver(appPort, '/hello')
      expect(await hasRedbox(browser, true)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        'Conflicting app and page file found: "app/hello/page.js" and "pages/hello.js". Please remove one to continue.'
      )
    })

    it('should show error overlay for /another', async () => {
      const browser = await webdriver(appPort, '/another')
      expect(await hasRedbox(browser, true)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        'Conflicting app and page file found: "app/another/page.js" and "pages/another.js". Please remove one to continue.'
      )
    })

    it('should not show error overlay for /non-conflict-pages', async () => {
      const browser = await webdriver(appPort, '/non-conflict-pages')
      expect(await hasRedbox(browser, false)).toBe(false)
      expect(await getRedboxHeader(browser)).toBe(null)
      expect(await browser.elementByCss('h1').text()).toBe('Hello World!')
    })

    it('should not show error overlay for /non-conflict', async () => {
      const browser = await webdriver(appPort, '/non-conflict')
      expect(await hasRedbox(browser, false)).toBe(false)
      expect(await getRedboxHeader(browser)).toBe(null)
      expect(await browser.elementByCss('p').text()).toBe('non-conflict app')
    })
  }
}

describe('Conflict between app file and page file', () => {
  describe('next dev', () => {
    beforeAll(async () => {
      output = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStdout(msg) {
          output += msg || ''
        },
        onStderr(msg) {
          output += msg || ''
        },
      })
      await waitFor(800)
    })
    afterAll(() => {
      killApp(app)
    })
    runTests({ dev: true })
  })

  describe('next build', () => {
    beforeAll(async () => {
      output = ''
      const { stdout, stderr } = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
        env: { NEXT_SKIP_APP_REACT_INSTALL: '1' },
      })
      output = stdout + stderr
    })
    afterAll(() => {
      killApp(app)
    })
    runTests({ dev: false })
  })
})
