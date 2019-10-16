/* global fixture, test */
import 'testcafe'

import path from 'path'

import {
  nextBuild,
  findPort,
  launchApp,
  renderViaHTTP,
  killApp,
  waitFor
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')

fixture('Handles Duplicate Pages')

fixture('production')

test('Throws an error during build', async t => {
  const { stdout } = await nextBuild(appDir, [], { stdout: true })
  await t.expect(stdout).contains('Duplicate page detected')
})

fixture('dev mode')

test('Shows warning in development', async t => {
  let output
  const handleOutput = msg => {
    output += msg
  }
  const appPort = await findPort()
  const app = await launchApp(appDir, appPort, {
    onStdout: handleOutput,
    onStderr: handleOutput
  })
  await renderViaHTTP(appPort, '/hello')
  await waitFor(3000)
  await killApp(app)
  await t.expect(output).match(/Duplicate page detected/)
})
