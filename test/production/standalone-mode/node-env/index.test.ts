import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'

describe('standalone mode - NODE_ENV', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let serverFile: string

  beforeAll(async () => {
    await next.stop()
    const standalonePath = join(next.testDir, '.next/standalone')
    serverFile = join(standalonePath, 'server.js')
    // deploy the env files next to server.js, like a real standalone deploy
    for (const file of ['.env.production', '.env.test']) {
      await fs.copy(join(next.testDir, file), join(standalonePath, file))
    }
  })

  async function runStandalone(nodeEnv: string | undefined) {
    const appPort = await findPort()
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...next.env,
      PORT: appPort.toString(),
    }
    // the test runner itself runs with NODE_ENV=test, so an unset
    // NODE_ENV has to be removed explicitly instead of just not set
    if (nodeEnv === undefined) {
      delete env.NODE_ENV
    } else {
      env.NODE_ENV = nodeEnv
    }

    let stderr = ''
    const server = await initNextServerScript(
      serverFile,
      /- Local:/,
      env,
      undefined,
      {
        cwd: next.testDir,
        onStderr(data) {
          stderr += data.toString()
        },
      }
    )
    try {
      const res = await fetchViaHTTP(appPort, '/api/node-env')
      return { marker: (await res.json()).marker as string, stderr }
    } finally {
      await killApp(server)
    }
  }

  it('should default to production when NODE_ENV is not set', async () => {
    const { marker, stderr } = await runStandalone(undefined)
    expect(marker).toBe('from-production-file')
    expect(stderr).not.toContain('non-standard "NODE_ENV"')
  })

  it('should not warn when NODE_ENV is set to production', async () => {
    const { marker, stderr } = await runStandalone('production')
    expect(marker).toBe('from-production-file')
    expect(stderr).not.toContain('non-standard "NODE_ENV"')
  })

  it('should respect an explicitly provided NODE_ENV and warn', async () => {
    const { marker, stderr } = await runStandalone('test')
    expect(marker).toBe('from-test-file')
    expect(stderr).toContain('non-standard "NODE_ENV"')
  })
})
