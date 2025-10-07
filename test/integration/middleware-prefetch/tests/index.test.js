/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  check,
  findPort,
  killApp,
  nextBuild,
  nextStart,
  getClientBuildManifestLoaderChunkUrlPath,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const context = {
  appDir: join(__dirname, '../'),
  buildLogs: { output: '', stdout: '', stderr: '' },
  logs: { output: '', stdout: '', stderr: '' },
}

describe('Middleware Production Prefetch', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      afterAll(() => killApp(context.app))
      beforeAll(async () => {
        const build = await nextBuild(context.appDir, undefined, {
          stderr: true,
          stdout: true,
        })

        context.buildId = await fs.readFile(
          join(context.appDir, '.next/BUILD_ID'),
          'utf8'
        )

        context.buildLogs = {
          output: build.stdout + build.stderr,
          stderr: build.stderr,
          stdout: build.stdout,
        }
        context.dev = false

        context.appPort = await findPort()
        context.app = await nextStart(context.appDir, context.appPort, {
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
        const browser = await webdriver(context.appPort, `/`)
        await browser.elementByCss('#made-up-link').moveTo()
        await check(async () => {
          const scripts = await browser.elementsByCss('script')
          const attrs = await Promise.all(
            scripts.map((script) => script.getAttribute('src'))
          )
          let chunk = getClientBuildManifestLoaderChunkUrlPath(
            context.appDir,
            '/ssg-page'
          )
          return attrs.find((src) => src.includes(chunk)) ? 'yes' : 'nope'
        }, 'yes')
      })

      it(`does not prefetch provided path if it will be rewritten`, async () => {
        const browser = await webdriver(context.appPort, `/`)
        await browser.elementByCss('#ssg-page-2').moveTo()
        await check(async () => {
          const scripts = await browser.elementsByCss('script')
          const attrs = await Promise.all(
            scripts.map((script) => script.getAttribute('src'))
          )
          return attrs.find((src) =>
            src.includes('/ssg-page-2' + (process.env.NEXT_RSPACK ? '-' : ''))
          )
            ? 'nope'
            : 'yes'
        }, 'yes')
      })
    }
  )
})
