/* eslint-env jest */

import {
  findPort,
  getRedboxHeader,
  hasRedbox,
  killApp,
  launchApp,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 5)
let app
let appPort
const appDir = join(__dirname, '..')

const errorMessage = /When using <Link> you should provide href attribute. https:\/\/err.sh\/next.js\/link-missing-href/

const showsError = async (
  pathname,
  regex,
  click = false,
  isWarn = false,
  cb
) => {
  const browser = await webdriver(appPort, pathname)
  if (isWarn) {
    await browser.eval(`(function() {
        window.warnLogs = []
        var origWarn = window.console.warn
        window.console.warn = function() {
          var warnStr = ''
          for (var i = 0; i < arguments.length; i++) {
            if (i > 0) warnStr += ' ';
            warnStr += arguments[i]
          }
          window.warnLogs.push(warnStr)
          origWarn.apply(undefined, arguments)
        }
      })()`)
  }

  if (click) {
    await browser.elementByCss('a').click()
  }
  if (isWarn) {
    await waitFor(2000)
    const warnLogs = await browser.eval('window.warnLogs')
    console.log(warnLogs)
    expect(warnLogs.some((log) => log.match(regex))).toBe(true)
  } else {
    expect(await hasRedbox(browser)).toBe(true)
    const errorContent = await getRedboxHeader(browser)
    expect(errorContent).toMatch(regex)
  }

  if (cb) await cb(browser)

  await browser.close()
}

const noError = async (pathname, click = false) => {
  const browser = await webdriver(appPort, '/')
  await browser.eval(`(function() {
      window.caughtErrors = []
      window.addEventListener('error', function (error) {
        window.caughtErrors.push(error.message || 1)
      })
      window.addEventListener('unhandledrejection', function (error) {
        window.caughtErrors.push(error.message || 1)
      })
      window.next.router.replace('${pathname}')
    })()`)
  // wait for page to be built and navigated to
  await waitFor(3000)
  if (click) {
    await browser.elementByCss('a').click()
  }
  const numErrors = await browser.eval(`window.caughtErrors.length`)
  expect(numErrors).toBe(0)
  await browser.close()
}

describe('Invalid link href', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    })
  })
  afterAll(() => killApp(app))

  it('Shows error when href is not present', async () => {
    await showsError('/first', errorMessage)
  })

  it('Shows error when href is null', async () => {
    await showsError('/second', errorMessage)
  })

  it('Shows error when href is undefined', async () => {
    await showsError('/third', errorMessage)
  })

  it('Shows no error when href is present', async () => {
    await noError('/fourth')
  })

  it('Shows no error when href is empty string', async () => {
    await noError('/fourth')
  })
})
