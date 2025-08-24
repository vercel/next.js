import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'

describe('type-module', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should work', async () => {
    await next.stop()
    const standalonePath = join(next.testDir, '.next/standalone')

    expect(fs.existsSync(join(standalonePath, 'package.json'))).toBe(true)

    const serverFile = join(standalonePath, 'server.js')

    const appPort = await findPort()
    const server = await initNextServerScript(
      serverFile,
      /- Local:/,
      { ...process.env, PORT: appPort.toString() },
      undefined,
      { cwd: next.testDir }
    )
    const res = await fetchViaHTTP(appPort, '/')
    expect(await res.text()).toContain('hello world')
    await killApp(server)
  })
})
