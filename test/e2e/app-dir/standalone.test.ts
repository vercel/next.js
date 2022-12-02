import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'

describe('output: standalone with app dir', () => {
  let next: NextInstance

  if (!(global as any).isNextStart) {
    it('should skip for non-next start', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'app')),
      dependencies: {
        swr: '2.0.0-rc.0',
        react: 'latest',
        'react-dom': 'latest',
        sass: 'latest',
      },
      skipStart: true,
    })

    await next.patchFile(
      'next.config.js',
      (await next.readFile('next.config.js')).replace('// output', 'output')
    )
    await next.start()
  })
  afterAll(async () => {
    await next.destroy()
  })

  it('should work correctly with output standalone', async () => {
    const tmpFolder = path.join(os.tmpdir(), 'next-standalone-' + Date.now())
    await fs.move(path.join(next.testDir, '.next/standalone'), tmpFolder)
    let server

    try {
      const testServer = path.join(tmpFolder, 'server.js')
      const appPort = await findPort()
      server = await initNextServerScript(
        testServer,
        /Listening on/,
        {
          ...process.env,
          PORT: appPort,
        },
        undefined,
        {
          cwd: tmpFolder,
        }
      )

      for (const testPath of [
        '/',
        '/api/hello',
        '/blog/first',
        '/dashboard',
        '/dashboard/deployments/123',
        '/catch-all/first',
      ]) {
        const res = await fetchViaHTTP(appPort, testPath)
        expect(res.status).toBe(200)
      }
    } finally {
      if (server) await killApp(server)
      await fs.remove(tmpFolder)
    }
  })
})
