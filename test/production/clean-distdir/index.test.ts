/* eslint-env jest */

import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

// Entries of the distDir that are kept across builds.
const RETAINED_ENTRIES = new Set([
  'cache',
  'dev',
  'diagnostics',
  'lock',
  'trace',
])

describe('Cleaning distDir', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeEach(async () => {
    await next.stop()
    await next.remove('.next')
  })

  /** Lists all files (and empty directories) in the distDir, except retained entries. */
  function listDistDir(dir = path.join(next.testDir, '.next'), prefix = '') {
    const result: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    if (prefix && entries.length === 0) {
      result.push(`${prefix}/`)
    }
    for (const entry of entries) {
      if (!prefix && RETAINED_ENTRIES.has(entry.name)) continue
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        result.push(...listDistDir(path.join(dir, entry.name), relative))
      } else {
        result.push(relative)
      }
    }
    return result.sort()
  }

  async function checkFileWrite(existsAfterBuild: boolean) {
    await next.build()

    const customFile = '.next/extra-file.txt'
    await next.patchFile(customFile, 'this is a testing file')

    await next.build()

    expect(await next.hasFile(customFile)).toBe(existsAfterBuild)

    // `.next/cache` should be preserved in all cases
    expect(await next.hasFile('.next/cache')).toBe(true)
    if (!isTurbopack) {
      expect(await next.hasFile('.next/cache/swc')).toBe(true)
    }
  }

  describe('disabled write', () => {
    it('should clean up .next before build start', async () => {
      await checkFileWrite(false)
    })

    it('should not clean up .next before build start', async () => {
      await next.patchFile(
        'next.config.js',
        `
          module.exports = {
            cleanDistDir: false
          }
        `,
        async () => {
          await checkFileWrite(true)
        }
      )
    })

    it('should not clean up .next with experimental.clearAfterBuild', async () => {
      await next.patchFile(
        'next.config.js',
        `
          module.exports = {
            cleanDistDir: false,
            experimental: { clearAfterBuild: true },
          }
        `,
        async () => {
          await checkFileWrite(true)
        }
      )
    })
  })

  describe.each([
    { clearAfterBuild: undefined },
    { clearAfterBuild: false },
    { clearAfterBuild: true },
  ])(
    'with experimental.clearAfterBuild: $clearAfterBuild',
    ({ clearAfterBuild }) => {
      // Only Turbopack builds support removing stale output after the build,
      // webpack builds always clean the distDir upfront.
      const removesStaleOutputAfterBuild = clearAfterBuild && isTurbopack

      it(`should ${removesStaleOutputAfterBuild ? 'remove' : 'keep'} files written to .next during the build`, async () => {
        const experimental =
          clearAfterBuild === undefined ? {} : { clearAfterBuild }
        await next.patchFile(
          'next.config.js',
          `
            const loader = require.resolve('./write-file-loader.js')
            module.exports = {
              experimental: ${JSON.stringify(experimental)},
              turbopack: { rules: { 'marker.js': { loaders: [loader] } } },
              webpack(config) {
                config.module.rules.push({ test: /marker\\.js$/, use: [loader] })
                return config
              },
            }
          `,
          async () => {
            const { exitCode } = await next.build()
            expect(exitCode).toBe(0)
            // Removing the distDir upfront happens before compilation, so it
            // keeps files written by loaders (or other tools) while compiling.
            // When removing the output not written by Turbopack after the
            // build instead, they are removed.
            expect(await next.hasFile('.next/loader-output.txt')).toBe(
              !removesStaleOutputAfterBuild
            )
            expect(await next.hasFile('.next/BUILD_ID')).toBe(true)
            if (isTurbopack) {
              // The loader runs in the Node.js evaluation pool, which is written
              // to `.next/build` while compiling. Only the output written at
              // the end of the build is kept.
              expect(await next.hasFile('.next/build')).toBe(
                !removesStaleOutputAfterBuild
              )
            }
          }
        )
      })
    }
  )

  describe('with experimental.clearAfterBuild: true', () => {
    beforeEach(async () => {
      await next.patchFile(
        'next.config.js',
        `
          module.exports = {
            output: 'standalone',
            // A stable build ID makes the output of builds comparable.
            generateBuildId: () => 'test-build-id',
            experimental: { clearAfterBuild: true },
          }
        `
      )
    })

    afterEach(async () => {
      await next.patchFile('next.config.js', 'module.exports = {}\n')
    })

    it('should produce the same output as a clean build when rebuilding', async () => {
      const { cliOutput } = await next.build()
      // The option is valid and enabled
      expect(cliOutput).toContain('clearAfterBuild')
      expect(cliOutput).not.toContain('Unrecognized key')
      const cleanBuildOutput = listDistDir()
      expect(cleanBuildOutput).toContain('BUILD_ID')
      expect(cleanBuildOutput).toContain('standalone/server.js')

      // Leftovers of a previous build that this build does not produce
      await next.patchFile('.next/stale-file.json', '{}')
      await next.patchFile('.next/server/stale-file.js', 'stale')
      await next.patchFile('.next/server/stale-dir/stale.js', 'stale')
      await next.patchFile('.next/static/stale-build-id/stale.js', 'stale')
      await next.patchFile('.next/standalone/stale-file.js', 'stale')
      fs.mkdirSync(path.join(next.testDir, '.next/server/stale-empty-dir'))
      await next.patchFile('.next/cache/keep.txt', 'keep')

      await next.build()

      // Exactly the files a clean build produces: stale files are gone and
      // unchanged output that was not rewritten is kept.
      expect(listDistDir()).toEqual(cleanBuildOutput)
      expect(await next.hasFile('.next/cache/keep.txt')).toBe(true)

      await next.start({ skipBuild: true })
      const html = await next.render('/')
      expect(html).toContain('hello from index')
      await next.stop()
    })

    it('should replace stale entries of a different type at written paths', async () => {
      const isDirectory = (file: string) =>
        fs.statSync(path.join(next.testDir, file)).isDirectory()
      await next.build()
      // A file and a directory written by the build: client chunks
      const writtenDir = '.next/static/chunks'
      const writtenFile = `.next/${listDistDir().find((file) =>
        file.startsWith('static/chunks/')
      )}`
      expect(isDirectory(writtenDir)).toBe(true)
      expect(isDirectory(writtenFile)).toBe(false)

      // A previous build left a directory where a file is written now
      fs.rmSync(path.join(next.testDir, writtenFile))
      await next.patchFile(`${writtenFile}/stale.js`, 'stale')
      expect((await next.build()).exitCode).toBe(0)
      expect(isDirectory(writtenFile)).toBe(false)

      // A previous build left a file where a directory is written now
      fs.rmSync(path.join(next.testDir, writtenDir), { recursive: true })
      await next.patchFile(writtenDir, 'stale')
      expect((await next.build()).exitCode).toBe(0)
      expect(isDirectory(writtenDir)).toBe(true)
      expect(isDirectory(writtenFile)).toBe(false)

      await next.start({ skipBuild: true })
      const html = await next.render('/')
      expect(html).toContain('hello from index')
      await next.stop()
    }, 120_000) // three builds

    it('should not type check stale files in the types directory', async () => {
      // When the tsconfig.json includes `.next/types` (e.g. it was added when
      // the project had an `app` dir), they are type checked, which happens
      // before compilation for the Pages Router.
      const tsconfig = {
        include: [
          'next-env.d.ts',
          '.next/types/**/*.ts',
          '**/*.ts',
          '**/*.tsx',
        ],
      }
      await next.patchFile(
        'tsconfig.json',
        JSON.stringify(tsconfig),
        async () => {
          await next.build()

          // A leftover of a previous build (e.g. generated types of a config
          // option that has been disabled since)
          await next.patchFile(
            '.next/types/stale.ts',
            'export const stale: number = "not a number"\n'
          )

          const { exitCode, cliOutput } = await next.build()
          expect(cliOutput).not.toContain('stale.ts')
          expect(exitCode).toBe(0)
          expect(await next.hasFile('.next/types/stale.ts')).toBe(false)
          expect(await next.hasFile('.next/types/routes.d.ts')).toBe(true)
        }
      )
    })

    it('should not leave a startable build behind when the build fails', async () => {
      await next.build()
      expect(await next.hasFile('.next/BUILD_ID')).toBe(true)

      await next.patchFile(
        'pages/index.js',
        'export default () => <div>{</div>',
        async () => {
          const { exitCode } = await next.build()
          expect(exitCode).not.toBe(0)
        }
      )

      expect(await next.hasFile('.next/BUILD_ID')).toBe(false)
    })
  })
})
