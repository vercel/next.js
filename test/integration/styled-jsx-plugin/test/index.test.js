/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../app')
let appPort
let app

function runTests() {
  it('should serve a page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('Hello World')
  })
}

describe('styled-jsx using in node_modules', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      const output = await nextBuild(appDir, undefined, {
        stdout: true,
        stderr: true,
        cwd: appDir,
      })

      console.log(output.stdout, output.stderr)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
