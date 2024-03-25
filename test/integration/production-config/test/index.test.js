/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  nextStart,
  nextBuild,
  findPort,
  killApp,
  runNextCommand,
} from 'next-test-utils'

const appDir = join(__dirname, '../')

let app
let appPort

describe('Production Config Usage', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      describe('with generateBuildId', () => {
        it('should add the custom buildid', async () => {
          const browser = await webdriver(appPort, '/')
          const text = await browser.elementByCss('#mounted').text()
          expect(text).toMatch(/ComponentDidMount executed on client\./)

          const html = await browser.eval('document.documentElement.innerHTML')
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

        it('should fail with NEXT_RUNTIME in env key', async () => {
          const result = await runNextCommand(['build', appDir], {
            env: { ENABLE_ENV_NEXT_PRESERVED: true },
            stdout: true,
            stderr: true,
          })

          expect(result.stderr).toMatch(/The key "NEXT_RUNTIME" under/)
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
    }
  )
})
