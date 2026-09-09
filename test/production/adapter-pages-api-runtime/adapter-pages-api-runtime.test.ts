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

  it('loads an external next/head dependency from a Pages API output', async () => {
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
          `require('next/setup-node-env'); const mod = require(${JSON.stringify(entryDestination)}); if (typeof mod.handler !== 'function') process.exit(1)`,
        ],
        { cwd: functionDir, env }
      )
    } finally {
      await fs.rm(functionDir, { recursive: true, force: true })
    }
  })
})
