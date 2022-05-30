/* eslint-env jest */

import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  waitFor,
} from 'next-test-utils'
import { join } from 'path'

const context = { appDir: join(__dirname, '../'), appPort: NaN, app: null }

jest.setTimeout(1000 * 60 * 2)

describe('Middleware overriding a Node.js API', () => {
  describe('dev mode', () => {
    let output = ''

    beforeAll(async () => {
      output = ''
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })
    })

    afterAll(() => killApp(context.app))

    it('shows a warning but allows overriding', async () => {
      const res = await fetchViaHTTP(context.appPort, '/')
      await waitFor(500)
      expect(res.status).toBe(200)
      expect(output)
        .toContain(`NodejsRuntimeApiInMiddlewareWarning: You're using a Node.js API (process.cwd) which is not supported in the Edge Runtime that Middleware uses.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime`)
      expect(output).toContain('fixed-value')
      expect(output).not.toContain('TypeError')
      expect(output).not.toContain(`You're using a Node.js API (process.env)`)
    })
  })
})
