import { ChildProcess } from 'child_process'
import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import { findPort, initNextServerScript, killApp, retry } from 'next-test-utils'
import { join } from 'path'

// The external packages are only imported by a server action, so the
// standalone output only contains them if the route's trace includes them.
describe('standalone mode: server action externals', () => {
  let server: ChildProcess
  let appPort: number

  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.build()

    await fs.move(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )

    await fs.copy(
      join(next.testDir, '.next/static'),
      join(next.testDir, 'standalone/.next/static')
    )

    // Remove everything else (including node_modules) so that the server can
    // only load what the file traces brought into the standalone output.
    for (const file of await fs.readdir(next.testDir)) {
      if (file !== 'standalone') {
        await fs.remove(join(next.testDir, file))
      }
    }

    const testServer = join(next.testDir, 'standalone/server.js')
    appPort = await findPort()
    server = await initNextServerScript(testServer, /- Local:/, {
      ...process.env,
      ...next.env,
      HOSTNAME: '::',
      PORT: '' + appPort,
    })
  })

  afterAll(async () => {
    if (server) {
      await killApp(server)
    }
  })

  it('should execute a server action that uses external packages', async () => {
    const browser = await next.browser('/', { baseUrl: appPort })
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('#result').text()).toBe('helloWorld')
    })
  })
})
