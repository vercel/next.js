/* eslint-env jest */

import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const context = {
  appDir: join(__dirname, '../'),
  logs: { output: '', stdout: '', stderr: '' },
}

describe('Middleware importing Node.js modules', () => {
  afterEach(() => {
    if (context.app) {
      killApp(context.app)
    }
  })

  describe('dev mode', () => {
    // restart the app for every test since the latest error is not shown sometimes
    // See https://github.com/vercel/next.js/issues/36575
    beforeEach(async () => {
      context.logs = { stdout: '', stderr: '' }
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
        env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
        onStdout(msg) {
          context.logs.stdout += msg
        },
        onStderr(msg) {
          context.logs.stderr += msg
        },
      })
    })

    it('warns about nested middleware being not allowed', async () => {
      const res = await fetchViaHTTP(context.appPort, '/about')
      expect(res.status).toBe(200)
      context.logs.stderr.includes('Nested Middleware is not allowed, found:')
      context.logs.stderr.includes('pages/about/_middleware')
      context.logs.stderr.includes('pages/api/_middleware')
    })
  })

  describe('production mode', () => {
    it('fails when there is a not allowed middleware', async () => {
      const buildResult = await nextBuild(context.appDir, undefined, {
        stderr: true,
        stdout: true,
      })
      expect(buildResult.stderr).toContain(
        'Nested Middleware is not allowed, found:'
      )
      expect(buildResult.stderr).toContain('pages/about/_middleware')
      expect(buildResult.stderr).toContain('pages/api/_middleware')
    })
  })
})
