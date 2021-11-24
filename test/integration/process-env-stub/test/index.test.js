/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  renderViaHTTP,
  waitFor,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')
let app
let stderr
let appPort

const buildWarning = (prop) =>
  `An environment variable (${prop}) that was not provided in the environment was accessed`

const checkMissing = async (pathname, prop, shouldWarn = false) => {
  stderr = ''
  await renderViaHTTP(appPort, pathname)
  await waitFor(1000)

  if (shouldWarn) {
    expect(stderr).toContain(buildWarning(prop))
  } else {
    expect(stderr).not.toContain(buildWarning(prop))
  }
}

const checkMissingClient = async (pathname, prop, shouldWarn = false) => {
  const browser = await webdriver(appPort, '/404')
  await browser.eval(`(function() {
    window.warnLogs = []
    var origWarn = console.warn

    console.warn = function() {
      window.warnLogs.push(arguments[0])
      origWarn.apply(this, arguments)
    }
    window.next.router.push("${pathname}")
  })()`)
  await waitFor(2000)

  const logs = await browser.eval(`window.warnLogs`)
  const warning = buildWarning(prop)
  const hasWarn = logs.some((log) => log.includes(warning))

  expect(hasWarn).toBe(shouldWarn)
  await browser.close()
}

describe('process.env stubbing', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: {
          NEXT_PUBLIC_HI: 'hi',
          I_SHOULD_BE_HERE: 'hello',
        },
        onStderr(msg) {
          stderr += msg || ''
        },
      })
    })
    afterAll(() => killApp(app))

    describe('server side', () => {
      it('should not show missing env value when its not missing public', async () => {
        await checkMissing('/not-missing', 'NEXT_PUBLIC_HI')
      })

      it('should not show missing env value when its not missing runtime', async () => {
        await checkMissing('/also-not-missing', 'I_SHOULD_BE_HERE')
      })

      it('should show missing env value when its missing normal', async () => {
        await checkMissing('/missing', 'hi', true)
      })

      it('should show missing env value when its missing GSP', async () => {
        await checkMissing('/missing-gsp', 'SECRET', true)
      })

      it('should show missing env value when its missing GSSP', async () => {
        await checkMissing('/missing-gssp', 'SECRET', true)
      })

      it('should show missing env value when its missing API', async () => {
        await checkMissing('/api/hi', 'where_is_it', true)
      })
    })

    describe('client side', () => {
      it('should not show missing env value when its not missing public', async () => {
        await checkMissingClient('/not-missing', 'NEXT_PUBLIC_HI')
      })

      it('should show missing env value when its missing runtime', async () => {
        await checkMissingClient('/also-not-missing', 'I_SHOULD_BE_HERE', true)
      })

      it('should show missing env value when its missing normal', async () => {
        await checkMissingClient('/missing', 'hi', true)
      })
    })
  })

  describe('production mode', () => {
    beforeAll(async () => {
      const { code } = await nextBuild(appDir)
      if (code !== 0) throw new Error(`build failed with code ${code}`)
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
    })
    afterAll(() => killApp(app))

    describe('server side', () => {
      it('should not show missing env value when its not missing public', async () => {
        await checkMissing('/not-missing', 'NEXT_PUBLIC_HI')
      })

      it('should not show missing env value when its not missing runtime', async () => {
        await checkMissing('/also-not-missing', 'I_SHOULD_BE_HERE')
      })

      it('should not show missing env value when its missing normal', async () => {
        await checkMissing('/missing', 'hi')
      })

      it('should not show missing env value when its missing GSP', async () => {
        await checkMissing('/missing-gsp', 'SECRET')
      })

      it('should not show missing env value when its missing GSSP', async () => {
        await checkMissing('/missing-gssp', 'SECRET')
      })

      it('should not show missing env value when its missing API', async () => {
        await checkMissing('/api/hi', 'where_is_it')
      })
    })

    describe('client side', () => {
      it('should not show missing env value when its not missing public', async () => {
        await checkMissingClient('/not-missing', 'NEXT_PUBLIC_HI')
      })

      it('should not show missing env value when its missing runtime', async () => {
        await checkMissingClient('/also-not-missing', 'I_SHOULD_BE_HERE')
      })

      it('should not show missing env value when its missing normal', async () => {
        await checkMissingClient('/missing', 'hi')
      })
    })
  })
})
