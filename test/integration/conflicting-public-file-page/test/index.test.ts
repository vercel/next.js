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
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      it('Throws error during development', async () => {
        const appPort = await findPort()
        let output = ''
        const app = await launchApp(appDir, appPort, {
          onStdout: (data) => {
            output += data.toString()
          },
          onStderr: (data) => {
            output += data.toString()
          },
        })

        const regex =
          /A conflicting public file and page file was found for path/

        const conflicts = ['/another/conflict', '/hello']
        for (const conflict of conflicts) {
          const html = await renderViaHTTP(appPort, conflict)
          expect(html).toMatch(regex)
        }

        expect(output).toMatch(regex)

        await killApp(app)
      })
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
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
    }
  )
})
