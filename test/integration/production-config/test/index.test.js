/* eslint-env jest */
/* global jasmine, browser */
import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  runNextCommand
} from 'next-test-utils'
import { getComputedCSS } from 'puppet-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const appDir = join(__dirname, '../')

let server

describe('Production Config Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    const app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })
    server = await startApp(app)
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

  describe('env', () => {
    it('should fail with __ in env key', async () => {
      const result = await runNextCommand(['build', appDir], { spawnOptions: {
        env: {
          ...process.env,
          ENABLE_ENV_FAIL_UNDERSCORE: true
        }
      },
      stdout: true,
      stderr: true })

      expect(result.stderr).toMatch(/The key "__NEXT_MY_VAR" under/)
    })

    it('should fail with NODE_ in env key', async () => {
      const result = await runNextCommand(['build', appDir], { spawnOptions: {
        env: {
          ...process.env,
          ENABLE_ENV_FAIL_NODE: true
        }
      },
      stdout: true,
      stderr: true })

      expect(result.stderr).toMatch(/The key "NODE_ENV" under/)
    })
  })

  describe('with generateBuildId', () => {
    it('should add the custom buildid', async () => {
      const page = await browser.newPage()
      await page.goto(server.getURL('/'))
      await expect(page).toMatchElement('#mounted', {
        text: /ComponentDidMount executed on client\./
      })
      /* istanbul ignore next */
      const html = await page.evaluate(() => document.querySelector('html').innerHTML)
      expect(html).toMatch('custom-buildid')
      await page.close()
    })
  })
})

async function testBrowser () {
  const page = await browser.newPage()
  await page.goto(server.getURL('/'))
  await expect(page).toMatchElement('#mounted', {
    text: /ComponentDidMount executed on client\./
  })
  expect(await getComputedCSS(page, '#mounted', 'font-size')).toBe('40px')
  expect(await getComputedCSS(page, '#mounted', 'color')).toBe('rgb(255, 0, 0)')
  await page.close()
}
