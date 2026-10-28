import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import execa from 'execa'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter-pages-api-runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('invokes a packaged Pages API output with an external next/head dependency', async () => {
    await next.build()

    const { outputs, repoRoot }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')
    const apiOutput = outputs.pagesApi.find(
      (output) => output.pathname === '/api/hello'
    )

    expect(apiOutput).toBeDefined()

    const functionDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'next-adapter-pages-api-')
    )

    try {
      for (const [target, source] of Object.entries(apiOutput!.assets)) {
        const destination = path.join(functionDir, target)
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.cp(source, destination, {
          recursive: true,
          verbatimSymlinks: true,
        })
      }

      const entryPath = path.relative(repoRoot, apiOutput!.filePath)
      const entryDestination = path.join(functionDir, entryPath)
      await fs.mkdir(path.dirname(entryDestination), { recursive: true })
      await fs.copyFile(apiOutput!.filePath, entryDestination)

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'production',
      }
      if (process.env.IS_TURBOPACK_TEST) {
        env.TURBOPACK = '1'
      } else {
        delete env.TURBOPACK
      }

      await execa(
        process.execPath,
        [
          // Newer Node.js versions select @swc/helpers' `module-sync` export,
          // which is unrelated to the Pages runtime behavior under test and is
          // not represented in Turbopack's current output trace.
          ...(process.allowedNodeEnvironmentFlags.has(
            '--no-experimental-require-module'
          )
            ? ['--no-experimental-require-module']
            : []),
          '-e',
          `
          require('next/setup-node-env')
          const assert = require('node:assert/strict')
          const { createServer } = require('node:http')
          const { once } = require('node:events')
          const mod = require(${JSON.stringify(entryDestination)})
          assert.equal(typeof mod.handler, 'function')
          async function main() {
            const pending = []
            const server = createServer((req, res) => {
              Promise.resolve(mod.handler(req, res, { waitUntil: (work) => pending.push(work) }))
                .catch((error) => { console.error(error); res.writeHead(500).end() })
            })
            server.listen(0, '127.0.0.1')
            await once(server, 'listening')
            try {
              const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/hello', {
                signal: AbortSignal.timeout(10000),
              })
              assert.equal(response.status, 200)
              assert.deepEqual(await response.json(), { hello: 'world' })
              await Promise.all(pending)
            } finally {
              server.closeAllConnections()
              await new Promise((resolve) => server.close(resolve))
            }
          }
          main().catch((error) => { console.error(error); process.exitCode = 1 })
          `,
        ],
        { cwd: functionDir, env, extendEnv: false, timeout: 30000 }
      )
    } finally {
      await fs.rm(functionDir, { recursive: true, force: true })
    }
  })
})
