/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import assert from 'assert'
import { check, findPort, killApp, nextBuild, nextStart } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const context = {
  appDir: join(__dirname, '../'),
  buildLogs: { output: '', stdout: '', stderr: '' },
  logs: { output: '', stdout: '', stderr: '' },
}

describe('Middleware Production Prefetch', () => {
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
        NEXT_RUNTIME: 'edge',
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
      return attrs.find((src) => src.includes('/ssg-page')) ? 'yes' : 'nope'
    }, 'yes')
  })

  it(`prefetches data when it is ssg`, async () => {
    const browser = await webdriver(context.appPort, `/`)
    await browser.elementByCss('#made-up-link').moveTo()
    await check(async () => {
      const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
      const mapped = hrefs.map((href) =>
        new URL(href).pathname.replace(/^\/_next\/data\/[^/]+/, '')
      )
      assert.deepEqual(mapped, [
        '/index.json',
        '/made-up.json',
        '/ssg-page-2.json',
      ])
      return 'yes'
    }, 'yes')
  })

  it(`doesn't prefetch when the destination will be rewritten`, async () => {
    const browser = await webdriver(context.appPort, `/`)
    await browser.elementByCss('#ssg-page-2').moveTo()
    await check(async () => {
      const scripts = await browser.elementsByCss('script')
      const attrs = await Promise.all(
        scripts.map((script) => script.getAttribute('src'))
      )
      return attrs.find((src) => src.includes('/ssg-page-2')) ? 'nope' : 'yes'
    }, 'yes')
  })
})
