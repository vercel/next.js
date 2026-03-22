/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  check,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let output = ''
let appPort
let app

const handleOutput = (msg) => {
  output += msg
}

describe('Empty Project', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStdout: handleOutput,
      onStderr: handleOutput,
    })
  })
  afterAll(() => killApp(app))

  it('It should show empty object warning on SSR', async () => {
    output = ''
    await renderViaHTTP(appPort, '/')
    await waitFor(100)
    expect(output).toMatch(/returned an empty object from `getInitialProps`/)
  })

  it('It should not show empty object warning for page without `getInitialProps`', async () => {
    output = ''
    await renderViaHTTP(appPort, '/static')
    await waitFor(100)
    expect(output).not.toMatch(
      /returned an empty object from `getInitialProps`/
    )
  })

  it('should show empty object warning during client transition', async () => {
    const browser = await webdriver(appPort, '/static')
    try {
      await browser.eval(`(function() {
        window.gotWarn = false
        const origWarn = console.warn
        window.console.warn = function () {
          if (arguments[0].match(/returned an empty object from \`getInitialProps\`/)) {
            window.gotWarn = true
          }
          origWarn.apply(this, arguments)
        }
        window.next.router.replace('/another')
      })()`)
      await check(async () => {
        const gotWarn = await browser.eval(`window.gotWarn`)
        return gotWarn ? 'pass' : 'fail'
      }, 'pass')
    } finally {
      await browser.close()
    }
  })
})
