import { copyTracedFiles } from 'next/dist/build/utils'
import { defaultConfig } from 'next/dist/server/config-shared'
import fs from 'fs-extra'
import { tmpdir } from 'os'
import { dirname, join, relative } from 'path'

describe.each(['module', 'commonjs'])(
  'copyTracedFiles with type %s',
  (type) => {
    let tracingRoot: string

    beforeEach(async () => {
      tracingRoot = await fs.mkdtemp(join(tmpdir(), 'next-copy-traced-files-'))
    })

    afterEach(async () => {
      await fs.remove(tracingRoot)
    })

    it.each([
      { distDir: '.next', stalePackage: false },
      { distDir: 'output/.next', stalePackage: false },
      { distDir: '../dist/app/.next', stalePackage: false },
      { distDir: '../dist/app/.next', stalePackage: true },
    ])(
      'uses the app package with $distDir and stalePackage=$stalePackage',
      async ({ distDir, stalePackage }) => {
        const dir = join(tracingRoot, 'app')
        const absoluteDistDir = join(dir, distDir)
        const packageJson = { name: 'source-app', type }
        await fs.outputJson(join(dir, 'package.json'), packageJson)
        await fs.outputJson(join(absoluteDistDir, 'next-server.js.nft.json'), {
          version: 1,
          files: [],
        })

        if (stalePackage) {
          await fs.outputJson(join(dirname(absoluteDistDir), 'package.json'), {
            name: 'stale-output',
            type: type === 'module' ? 'commonjs' : 'module',
          })
        }

        await copyTracedFiles(
          dir,
          absoluteDistDir,
          [],
          undefined,
          tracingRoot,
          defaultConfig,
          { version: 3, middleware: {}, functions: {}, sortedMiddleware: [] },
          false,
          false,
          new Set()
        )

        const standalonePath = join(
          absoluteDistDir,
          'standalone',
          relative(tracingRoot, dir)
        )
        expect(await fs.readJson(join(standalonePath, 'package.json'))).toEqual(
          packageJson
        )
        const server = await fs.readFile(
          join(standalonePath, 'server.js'),
          'utf8'
        )
        if (type === 'module') {
          expect(server).toContain("import module from 'node:module'")
          expect(server).toContain('module.createRequire(import.meta.url)')
        } else {
          expect(server).toContain("const path = require('path')")
          expect(server).not.toContain('import.meta.url')
        }
      }
    )
  }
)
