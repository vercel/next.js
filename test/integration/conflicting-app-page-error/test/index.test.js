/* eslint-env jest */

import path from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextBuild,
  waitFor,
} from 'next-test-utils'

let app
let appPort
const appDir = path.join(__dirname, '..')
let output = ''

function runTests() {
  it('should print error for reach conflicting page', async () => {
    expect(output).toMatch(/Conflicting app and page files were found/)

    for (const conflict of ['/hello', '/another']) {
      expect(output).toContain(conflict)
    }
    expect(output).not.toContain('/non-conflict')
  })
}

describe('Conflict between app file and page file', () => {
  describe('next dev', () => {
    beforeAll(async () => {
      output = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStdout(msg) {
          output += msg || ''
        },
        onStderr(msg) {
          output += msg || ''
        },
      })
      await waitFor(800)
    })
    afterAll(() => {
      killApp(app)
    })
    runTests()
  })

  describe('next build', () => {
    beforeAll(async () => {
      output = ''
      const { stdout, stderr } = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      output = stdout + stderr
    })
    afterAll(() => {
      killApp(app)
    })
    runTests()
  })
})
