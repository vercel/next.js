/* eslint-disable jest/no-identical-title */
/* eslint-env jest */

import { remove } from 'fs-extra'
import { join } from 'path'
import {
  fetchViaHTTP,
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const context = {
  appDir: join(__dirname, '../'),
  logs: { output: '', stdout: '', stderr: '' },
  api: new File(join(__dirname, '../pages/api/route.js')),
  lib: new File(join(__dirname, '../lib.js')),
  middleware: new File(join(__dirname, '../middleware.js')),
  page: new File(join(__dirname, '../pages/index.js')),
}
const appOption = {
  env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
  onStdout(msg) {
    context.logs.output += msg
    context.logs.stdout += msg
  },
  onStderr(msg) {
    context.logs.output += msg
    context.logs.stderr += msg
  },
}
const routeUrl = '/api/route'
const middlewareUrl = '/'

describe('Edge runtime code with imports', () => {
  beforeEach(async () => {
    context.appPort = await findPort()
    context.logs = { output: '', stdout: '', stderr: '' }
    await remove(join(__dirname, '../.next'))
  })

  afterEach(async () => {
    if (context.app) {
      await killApp(context.app)
    }
    context.api.restore()
    context.middleware.restore()
    context.lib.restore()
    context.page.restore()
  })

  describe.each([
    {
      title: 'Edge API',
      url: routeUrl,
    },
    {
      title: 'Middleware',
      url: middlewareUrl,
    },
  ])('test error if response is not Response type', ({ title, url }) => {
    it(`${title} dev test Response`, async () => {
      context.app = await launchApp(context.appDir, context.appPort, appOption)
      const res = await fetchViaHTTP(context.appPort, url)
      expect(context.logs.stderr).toContain(
        'Expected an instance of Response to be returned'
      )
      expect(res.status).toBe(500)
    })
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        it(`${title} build test Response`, async () => {
          await nextBuild(context.appDir, undefined, {
            stderr: true,
          })
          context.app = await nextStart(
            context.appDir,
            context.appPort,
            appOption
          )
          const res = await fetchViaHTTP(context.appPort, url)
          expect(context.logs.stderr).toContain(
            'Expected an instance of Response to be returned'
          )
          expect(res.status).toBe(500)
        })
      }
    )
  })
})
