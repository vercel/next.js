/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  getClientBuildManifestLoaderChunkUrlPath,
  retry,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let appPort
let app
const context = {
  appDir: join(__dirname, '../'),
  buildLogs: { output: '', stdout: '', stderr: '' },
  logs: { output: '', stdout: '', stderr: '' },
}

describe('Middleware Production Prefetch', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      afterAll(() => killApp(app))
      beforeAll(async () => {
        const build = await nextBuild(context.appDir, undefined, {
          stderr: true,
          stdout: true,
        })

        await fs.readFile(join(context.appDir, '.next/BUILD_ID'), 'utf8')

        context.buildLogs = {
          output: build.stdout + build.stderr,
          stderr: build.stderr,
          stdout: build.stdout,
        }

        appPort = await findPort()
        app = await nextStart(context.appDir, appPort, {
          env: {
            MIDDLEWARE_TEST: 'asdf',
          },
          onStdout(msg) {
            context.logs.output += msg
            context.logs.stdout += msg
          },
          onStderr(msg) {
            context.logs.output += msg
            context.logs.stderr += msg
          },
        })
      })

      it(`prefetch correctly for unexistent routes`, async () => {
        const browser = await webdriver(appPort, `/`)
        await browser.elementByCss('#made-up-link').moveTo()
        await retry(
          async () => {
            const scripts = await browser.elementsByCss('script')
            const attrs = await Promise.all(
              scripts.map((script) => script.getAttribute('src'))
            )
            let chunk = getClientBuildManifestLoaderChunkUrlPath(
              context.appDir,
              '/ssg-page'
            )
            expect(attrs.find((src) => src.includes(chunk))).toBeTruthy()
          },
          30000,
          1000
        )
      })

      it(`does not prefetch provided path if it will be rewritten`, async () => {
        const browser = await webdriver(appPort, `/`)
        await browser.elementByCss('#ssg-page-2').moveTo()
        await retry(
          async () => {
            const scripts = await browser.elementsByCss('script')
            const attrs = await Promise.all(
              scripts.map((script) => script.getAttribute('src'))
            )
            expect(
              attrs.find((src) =>
                src.includes(
                  '/ssg-page-2' + (process.env.NEXT_RSPACK ? '-' : '')
                )
              )
            ).toBeFalsy()
          },
          30000,
          1000
        )
      })
    }
  )
})
