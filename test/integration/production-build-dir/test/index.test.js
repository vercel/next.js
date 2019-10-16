/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'

fixture('Production Custom Build Directory')

test('should render the page', async t => {
  const result = await runNextCommand(['build', 'build'], {
    cwd: join(__dirname, '..'),
    stdout: true,
    stderr: true
  })
  await t.expect(result.stderr).eql('')

  const app = nextServer({
    dir: join(__dirname, '../build'),
    dev: false,
    quiet: true
  })

  const server = await startApp(app)
  const appPort = server.address().port

  const html = await renderViaHTTP(appPort, '/')
  await t.expect(html).match(/Hello World/)

  await stopApp(server)
})
