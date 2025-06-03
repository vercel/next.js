import { FileRef, nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  findPort,
  initNextServerScript,
  killApp,
  fetchViaHTTP,
} from 'next-test-utils'

if (!(globalThis as any).isNextStart) {
  it('should skip for non-next start', () => {})
} else {
  describe('output: standalone with ESM app dir', () => {
    const { next, skipped } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'app')),
        pages: new FileRef(path.join(__dirname, 'pages')),
        public: new FileRef(path.join(__dirname, 'public')),
        'next.config.js': 'export default {"output": "standalone"}',
      },
      packageJson: {
        type: 'module',
      },
      skipStart: true,
    })

    if (skipped) {
      return
    }

    beforeAll(async () => {
      await next.start()
    })

    it('should work correctly with output standalone', async () => {
      const tmpFolder = path.join(os.tmpdir(), 'next-standalone-' + Date.now())
      await fs.mkdirp(tmpFolder)
      await fs.writeFile(
        path.join(tmpFolder, 'package.json'),
        '{"type": "module"}'
      )
      const distFolder = path.join(tmpFolder, 'test')
      await fs.move(path.join(next.testDir, '.next/standalone'), distFolder)
      let server: any
      try {
        const testServer = path.join(distFolder, 'server.js')
        const appPort = await findPort()
        server = await initNextServerScript(
          testServer,
          /- Local:/,
          {
            ...process.env,
            PORT: appPort.toString(),
          },
          undefined,
          {
            cwd: distFolder,
          }
        )
        for (const testPath of ['/app', '/pages', '/opengraph-image']) {
          const res = await fetchViaHTTP(appPort, testPath)
          expect(res.status).toBe(200)
        }
      } finally {
        if (server) await killApp(server)
        await fs.remove(tmpFolder)
      }
    })
  })
}
