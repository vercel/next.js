import { NextInstance, createNext } from 'e2e-utils'
import fs from 'fs-extra'
import {
  findPort,
  initNextServerScript,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'
import { join } from 'path'

let MY_DEPLOYMENT_ID = 'test-deployment-id'

describe('standalone mode: runtimeServerDeploymentId', () => {
  let next: NextInstance
  let server
  let appPort
  let output = ''

  beforeAll(async () => {
    next = await createNext({
      files: __dirname,
      env: {
        NEXT_DEPLOYMENT_ID: MY_DEPLOYMENT_ID,
      },
      skipStart: true,
    })
    let { exitCode } = await next.build()
    // eslint-disable-next-line jest/no-standalone-expect
    expect(exitCode).toBe(0)

    await fs.move(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )

    for (const file of await fs.readdir(next.testDir)) {
      if (file !== 'standalone') {
        await fs.remove(join(next.testDir, file))
        console.log('removed', file)
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
        NEXT_DEPLOYMENT_ID: MY_DEPLOYMENT_ID,
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

  it.each([
    'app-page',
    'app-page-edge',
    'app-route',
    'app-route-edge',
    'pages-page',
    'pages-page-edge',
    'api/pages-route',
    'api/pages-route-edge',
  ])('it should load %s', async (name) => {
    expect(output).toContain(`- Local:`)

    let html = await renderViaHTTP(appPort, `/${name}`)
    expect(html).toContain(`Hello from ${name}`)
  })
})
