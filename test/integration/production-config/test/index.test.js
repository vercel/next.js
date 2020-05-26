/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  runNextCommand,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)

const appDir = join(__dirname, '../')

let appPort
let server

describe('Production Config Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    const app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true,
    })
    server = await startApp(app)
    appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  describe('with next-css', () => {
    it('should load styles', async () => {
      // Try 3 times as the breaking happens intermittently
      await testBrowser()
      await testBrowser()
      await testBrowser()
    })
  })

  describe('with generateBuildId', () => {
    it('should add the custom buildid', async () => {
      const browser = await webdriver(appPort, '/')
      const text = await browser.elementByCss('#mounted').text()
      expect(text).toMatch(/ComponentDidMount executed on client\./)

      const html = await browser.elementByCss('html').getAttribute('innerHTML')
      expect(html).toMatch('custom-buildid')
      await browser.close()
    })
  })

  describe('env', () => {
    it('should fail with leading __ in env key', async () => {
      const result = await runNextCommand(['build', appDir], {
        env: { ENABLE_ENV_FAIL_UNDERSCORE: true },
        stdout: true,
        stderr: true,
      })

      expect(result.stderr).toMatch(/The key "__NEXT_MY_VAR" under/)
    })

    it('should fail with NODE_ in env key', async () => {
      const result = await runNextCommand(['build', appDir], {
        env: { ENABLE_ENV_FAIL_NODE: true },
        stdout: true,
        stderr: true,
      })

      expect(result.stderr).toMatch(/The key "NODE_ENV" under/)
    })

    it('should allow __ within env key', async () => {
      const result = await runNextCommand(['build', appDir], {
        env: { ENABLE_ENV_WITH_UNDERSCORES: true },
        stdout: true,
        stderr: true,
      })

      expect(result.stderr).not.toMatch(/The key "SOME__ENV__VAR" under/)
    })
  })
})

async function testBrowser() {
  const browser = await webdriver(appPort, '/')
  const element = await browser.elementByCss('#mounted')
  const text = await element.text()
  expect(text).toMatch(/ComponentDidMount executed on client\./)
  expect(await element.getComputedCss('font-size')).toBe('40px')
  expect(await element.getComputedCss('color')).toBe('rgba(255, 0, 0, 1)')
  await browser.close()
}
