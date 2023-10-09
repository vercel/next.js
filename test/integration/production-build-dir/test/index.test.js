/* eslint-env jest */

import { join } from 'path'
import {
  runNextCommand,
  nextStart,
  killApp,
  findPort,
  renderViaHTTP,
} from 'next-test-utils'

describe('Production Custom Build Directory', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('With basic usage', () => {
      it('should render the page', async () => {
        const result = await runNextCommand(['build', 'build'], {
          cwd: join(__dirname, '..'),
          stdout: true,
          stderr: true,
        })
        expect(result.stderr).toBe('')

        const appPort = await findPort()
        const app = await nextStart(join(__dirname, '../build'), appPort)

        const html = await renderViaHTTP(appPort, '/')
        expect(html).toMatch(/Hello World/)

        await killApp(app)
      })
    })
  })
})
