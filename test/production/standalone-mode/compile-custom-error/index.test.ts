import { ChildProcess } from 'child_process'
import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import { findPort, initNextServerScript, killApp } from 'next-test-utils'
import { join } from 'path'

describe('standalone mode - compile with custom 500 page', () => {
  let server: ChildProcess
  let appPort: number

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    const result = await next.build({
      args: ['--experimental-build-mode', 'compile'],
    })

    if (result.exitCode !== 0) {
      throw new Error(
        `Build exited with code ${result.exitCode}. CLI Output:\n\n${result.cliOutput}`
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

    appPort = await findPort()
    server = await initNextServerScript(
      join(next.testDir, 'standalone/server.js'),
      /- Local:/,
      {
        ...process.env,
        ...next.env,
        HOSTNAME: '::',
        PORT: '' + appPort,
      }
    )
  })

  afterAll(async () => {
    if (server) {
      await killApp(server)
    }
  })

  it('should render the custom 500 page for server errors', async () => {
    const response = await fetch(`http://localhost:${appPort}/?fail=1`)
    const html = await response.text()

    expect(response.status).toBe(500)
    expect(html).toContain('Custom 500 page')
  })
})
