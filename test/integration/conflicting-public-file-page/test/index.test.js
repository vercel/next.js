/* global fixture, test */
import 'testcafe'

import path from 'path'
import {
  nextBuild,
  launchApp,
  findPort,
  killApp,
  renderViaHTTP,
  waitFor
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')

fixture('Errors on conflict between public file and page file')

test('Throws error during development', async t => {
  const appPort = await findPort()
  const app = await launchApp(appDir, appPort)
  const conflicts = ['/another/conflict', '/another/index', '/hello']

  for (const conflict of conflicts) {
    const html = await renderViaHTTP(appPort, conflict)
    await t
      .expect(html)
      .match(/A conflicting public file and page file was found for path/)
  }
  await waitFor(1000)
  await killApp(app)
})

test('Throws error during build', async t => {
  const conflicts = ['/another/conflict', '/another', '/hello']
  const results = await nextBuild(appDir, [], { stdout: true, stderr: true })
  const output = results.stdout + results.stderr
  await t.expect(output).match(/Conflicting public and page files were found/)

  for (const conflict of conflicts) {
    await t.expect(output.indexOf(conflict) > 0).eql(true)
  }
})
