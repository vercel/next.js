/* eslint-env jest */

import { join } from 'path'
import {
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
  renderViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)

describe('Production Custom Build Directory', () => {
  describe('With basic usage', () => {
    it('should render the page', async () => {
      const result = await runNextCommand(['build', 'build'], {
        cwd: join(__dirname, '..'),
        stdout: true,
        stderr: true,
      })
      expect(result.stderr).toBe('')

      const app = nextServer({
        dir: join(__dirname, '../build'),
        dev: false,
        quiet: true,
      })

      const server = await startApp(app)
      const appPort = server.address().port

      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)

      await stopApp(server)
    })
  })
})
