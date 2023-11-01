/* eslint-env jest */

import path from 'path'
import {
  nextBuild,
  launchApp,
  findPort,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')

describe('Errors on conflict between public file and page file', () => {
  describe('development mode', () => {
    it('Throws error during development', async () => {
      const appPort = await findPort()
      const app = await launchApp(appDir, appPort)
      const conflicts = ['/another/conflict', '/hello']

      for (const conflict of conflicts) {
        const html = await renderViaHTTP(appPort, conflict)
        expect(html).toMatch(
          /A conflicting public file and page file was found for path/
        )
      }
      await killApp(app)
    })
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('Throws error during build', async () => {
      const conflicts = ['/another/conflict', '/another', '/hello']
      const results = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      const output = results.stdout + results.stderr
      expect(output).toMatch(/Conflicting public and page files were found/)

      for (const conflict of conflicts) {
        expect(output.indexOf(conflict) > 0).toBe(true)
      }
    })
  })
})
