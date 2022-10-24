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
const err =
  /Error: > The `app` dir is experimental. Please add `{experimental:{appDir: true}}` to your `next.config.js` to enable it/

function runTests() {
  it('should print error for conflicting app/page', async () => {
    expect(output).toMatch(err)
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
      await waitFor(200)
    })
    afterAll(() => {
      if (app) killApp(app)
    })
    runTests()
  })

  describe('next build', () => {
    beforeAll(async () => {
      output = ''
      const app = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
        env: { NEXT_SKIP_APP_REACT_INSTALL: '1' },
      })
      output = app.stdout + app.stderr
    })
    afterAll(() => {
      if (app) killApp(app)
    })
    runTests()
  })
})
