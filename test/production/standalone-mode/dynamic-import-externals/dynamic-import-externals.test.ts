import { ChildProcess } from 'child_process'
import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'
import { join } from 'path'

describe('standalone mode: dynamic import externals', () => {
  let server: ChildProcess
  let appPort: number
  const routeTraces: Record<string, { files: string[] }> = {}

  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.build()

    for (const route of ['one', 'two']) {
      routeTraces[route] = await next.readJSON(
        `.next/server/app/${route}/page.js.nft.json`
      )
    }

    await fs.move(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )
    await fs.copy(
      join(next.testDir, '.next/static'),
      join(next.testDir, 'standalone/.next/static')
    )

    for (const file of await fs.readdir(next.testDir)) {
      if (file !== 'standalone') {
        await fs.remove(join(next.testDir, file))
      }
    }

    appPort = await findPort()
    server = await initNextServerScript(
      join(next.testDir, 'standalone/server.js'),
      /- Local:/,
      {
        ...process.env,
        ...next.env,
        PORT: String(appPort),
      }
    )
  })

  afterAll(async () => {
    if (server) {
      await killApp(server)
    }
  })

  it.each(['/one', '/two'])(
    'should resolve the external package on %s',
    async (route) => {
      expect(routeTraces[route.slice(1)].files).toContainEqual(
        expect.stringContaining('node_modules/yocto-queue')
      )
      const response = await fetchViaHTTP(appPort, route)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('ok')
    }
  )
})
