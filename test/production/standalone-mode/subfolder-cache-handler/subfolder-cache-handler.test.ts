import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'
import fs from 'fs-extra'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'

describe.each(['', 'web', 'apps/site'])(
  'standalone custom cacheHandler built from subfolder %p',
  (subfolder) => {
    const { next, skipped } = nextTestSetup({
      files: {
        'next.config.js': `module.exports = {
          output: 'standalone',
          cacheHandler: require.resolve('./${path.posix.join(subfolder, 'cache-handler.js')}'),
          cacheMaxMemorySize: 0,
        }`,
        [path.join(subfolder, 'app')]: new FileRef(path.join(__dirname, 'app')),
        [path.join(subfolder, 'cache-handler.js')]: new FileRef(
          path.join(__dirname, 'cache-handler.js')
        ),
      },
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    let server: ChildProcess
    let port: number
    let output = ''

    beforeAll(async () => {
      const { exitCode } = await next.build({
        args: subfolder ? [subfolder] : [],
      })
      if (exitCode !== 0) throw new Error(`Fixture build failed: ${exitCode}`)

      const projectDir = path.join(next.testDir, subfolder)
      const standaloneDir = path.join(projectDir, '.next/standalone', subfolder)
      await fs.copy(
        path.join(projectDir, '.next/static'),
        path.join(standaloneDir, '.next/static')
      )

      port = await findPort()
      server = await initNextServerScript(
        path.join(standaloneDir, 'server.js'),
        /- Local:/,
        { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1' },
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
      if (server) await killApp(server)
    })

    it.each(['/', '/dynamic'])(
      'serves %s with the custom cache handler',
      async (pathname) => {
        const res = await fetchViaHTTP(port, pathname)

        expect(res.status).toBe(200)
        expect(output).toContain('custom cache handler loaded')
        expect(output).not.toContain('Cannot find module')
      }
    )
  }
)
