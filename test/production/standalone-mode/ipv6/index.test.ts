import { NextInstance, createNext } from 'e2e-utils'
import { move } from 'fs-extra'
import fsp from 'fs/promises'
import glob from 'glob'
import {
  findPort,
  initNextServerScript,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'
import { join } from 'path'

describe('standalone mode: ipv6 hostname', () => {
  let next: NextInstance
  let server
  let appPort
  let output = ''

  beforeAll(async () => {
    next = await createNext({
      files: __dirname,
    })
    await next.stop()

    await move(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )

    for (const file of await fsp.readdir(next.testDir)) {
      if (file !== 'standalone') {
        await fsp.rm(join(next.testDir, file), { recursive: true, force: true })
        console.log('removed', file)
      }
    }
    const files = glob.sync('**/*', {
      cwd: join(next.testDir, 'standalone/.next/server/pages'),
      dot: true,
    })

    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.html')) {
        await fsp.rm(join(next.testDir, '.next/server', file), {
          recursive: true,
          force: true,
        })
      }
    }

    const testServer = join(next.testDir, 'standalone/server.js')
    appPort = await findPort()
    server = await initNextServerScript(
      testServer,
      /- Local:/,
      {
        ...process.env,
        HOSTNAME: '::',
        PORT: appPort,
      },
      undefined,
      {
        cwd: next.testDir,
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      }
    )
  })
  afterAll(async () => {
    await next.destroy()
    if (server) await killApp(server)
  })

  it('should load the page without any errors', async () => {
    expect(output).toContain(`- Local:`)

    let html = await renderViaHTTP(appPort, '/app-page')
    expect(html).toContain('Hello from App')

    html = await renderViaHTTP(appPort, '/pages-page')
    expect(html).toContain('Hello from Pages')
  })
})
