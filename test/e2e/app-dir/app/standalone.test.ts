import { createNextDescribe } from 'e2e-utils'
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
  createNextDescribe(
    'output: standalone with app dir',
    {
      files: __dirname,
      skipStart: true,
    },
    ({ next }) => {
      beforeAll(async () => {
        await next.patchFile(
          'next.config.js',
          (await next.readFile('next.config.js')).replace('// output', 'output')
        )
        await next.start()
      })

      it('should handle trace files correctly for route groups (nodejs only)', async () => {
        expect(next.cliOutput).not.toContain('Failed to copy traced files')
        const serverDirPath = path.join(
          next.testDir,
          '.next/standalone/.next/server'
        )
        for (const page of [
          '(newroot)/dashboard/another',
          '(newroot)/dashboard/project/[projectId]',
          '(rootonly)/dashboard/changelog',
        ]) {
          const pagePath = path.join(serverDirPath, 'app', page)

          expect(
            await fs.pathExists(path.join(pagePath, 'page.js.nft.json'))
          ).toBe(true)

          const files = (
            await fs.readJSON(path.join(pagePath, 'page.js.nft.json'))
          ).files as string[]

          for (const file of files) {
            expect(await fs.pathExists(path.join(pagePath, file))).toBe(true)
          }
        }
      })

      it('should work correctly with output standalone', async () => {
        const tmpFolder = path.join(
          os.tmpdir(),
          'next-standalone-' + Date.now()
        )
        await fs.move(path.join(next.testDir, '.next/standalone'), tmpFolder)
        let server: any

        try {
          const testServer = path.join(tmpFolder, 'server.js')
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
              cwd: tmpFolder,
            }
          )

          for (const testPath of [
            '/',
            '/api/hello',
            '/blog/first',
            '/dashboard',
            '/dashboard/another',
            '/dashboard/changelog',
            '/dashboard/deployments/breakdown',
            '/dashboard/deployments/123',
            '/dashboard/hello',
            '/dashboard/project/123',
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
    }
  )
}
