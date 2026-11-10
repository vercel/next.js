import { nextTestSetup, isNextStart } from 'e2e-utils'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  findPort,
  initNextServerScript,
  killApp,
  fetchViaHTTP,
} from 'next-test-utils'

if (!isNextStart) {
  it('should skip for non-next start', () => {})
} else {
  describe('output: standalone with compile build mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    if (skipped) {
      return
    }

    let tmpFolder: string
    let server: any
    let appPort: number

    beforeAll(async () => {
      await next.build({ args: ['--experimental-build-mode', 'compile'] })

      tmpFolder = path.join(os.tmpdir(), 'next-standalone-500-' + Date.now())
      await fs.move(path.join(next.testDir, '.next/standalone'), tmpFolder)

      const testServer = path.join(tmpFolder, 'server.js')
      appPort = await findPort()
      server = await initNextServerScript(
        testServer,
        /- Local:/,
        {
          ...process.env,
          ...next.env,
          PORT: appPort.toString(),
        },
        undefined,
        {
          cwd: tmpFolder,
        }
      )
    })

    afterAll(async () => {
      if (server) await killApp(server)
      if (tmpFolder) await fs.remove(tmpFolder)
    })

    it('should include the custom /500 page chunks in standalone output', async () => {
      const traceFile = path.join(
        tmpFolder,
        '.next/server/pages/500.js.nft.json'
      )
      const trace = await fs.readJSON(traceFile)
      const chunkFiles = (trace.files as string[]).filter((file) =>
        file.includes('chunks/ssr/')
      )
      expect(chunkFiles.length).toBeGreaterThan(0)
      for (const file of chunkFiles) {
        const standalonePath = path.join(
          tmpFolder,
          '.next/server',
          file.replace('../chunks/ssr/', 'chunks/ssr/')
        )
        expect(await fs.pathExists(standalonePath)).toBe(true)
      }
    })

    it('should render the custom /500 page from the standalone server', async () => {
      const homeRes = await fetchViaHTTP(appPort, '/')
      expect(homeRes.status).toBe(200)

      const failRes = await fetchViaHTTP(appPort, '/?fail=1')
      expect(failRes.status).toBe(500)
      expect(await failRes.text()).toContain('Custom 500 page')
    })
  })
}
