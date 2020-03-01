/* eslint-env jest */
/* global jasmine */
import path from 'path'
import {
  nextBuild,
  launchApp,
  findPort,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const appDir = path.join(__dirname, '..')

describe('Errors on conflict between public file and page file', () => {
  it('Throws error during development', async () => {
    const appPort = await findPort()
    const app = await launchApp(appDir, appPort)
    const conflicts = ['/another/conflict', '/another/index', '/hello']

    for (const conflict of conflicts) {
      const html = await renderViaHTTP(appPort, conflict)
      expect(html).toMatch(
        /A conflicting public file and page file was found for path/
      )
    }
    await killApp(app)
  })

  it('Throws error during build', async () => {
    const conflicts = ['/another/conflict', '/another', '/hello']
    const results = await nextBuild(appDir, [], { stdout: true, stderr: true })
    const output = results.stdout + results.stderr
    expect(output).toMatch(/Conflicting public and page files were found/)

    for (const conflict of conflicts) {
      expect(output.indexOf(conflict) > 0).toBe(true)
    }
  })
})
