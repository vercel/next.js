import fs from 'fs-extra'

import { join } from 'path'

import { nextBuild } from 'next-test-utils'

const dirCustomConfig = join(__dirname, '../custom-config')
const dirIgnoreDuringBuilds = join(__dirname, '../ignore-during-builds')
const dirBaseDirectories = join(__dirname, '../base-directories')
const dirCustomDirectories = join(__dirname, '../custom-directories')
const dirInvalidOlderEslintVersion = join(
  __dirname,
  '../invalid-eslint-version'
)
const dirEmptyDirectory = join(__dirname, '../empty-directory')
const dirEslintIgnore = join(__dirname, '../eslint-ignore')
const dirNoEslintPlugin = join(__dirname, '../no-eslint-plugin')
const dirEslintCache = join(__dirname, '../eslint-cache')
const dirEslintCacheCustomDir = join(__dirname, '../eslint-cache-custom-dir')

describe('Next Build', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      test('shows warnings and errors', async () => {
        const { stdout, stderr } = await nextBuild(dirCustomConfig, [], {
          stdout: true,
          stderr: true,
          lint: true,
        })

        const output = stdout + stderr
        expect(output).toContain(
          'Warning: Synchronous scripts should not be used.'
        )
        expect(output).toContain(
          'Error: Comments inside children section of tag should be placed inside braces'
        )
      })

      test('ignore during builds', async () => {
        const { stdout, stderr } = await nextBuild(dirIgnoreDuringBuilds, [], {
          stdout: true,
          stderr: true,
          lint: true,
        })

        const output = stdout + stderr
        expect(output).not.toContain('Failed to compile')
        expect(output).not.toContain(
          'Error: Comments inside children section of tag should be placed inside braces'
        )
      })

      test('base directories are linted by default during builds', async () => {
        const { stdout, stderr } = await nextBuild(dirBaseDirectories, [], {
          stdout: true,
          stderr: true,
          lint: true,
        })

        const output = stdout + stderr

        expect(output).toContain('Failed to compile')
        expect(output).toContain(
          'Error: `next/head` should not be imported in `pages/_document.js`. Use `<Head />` from `next/document` instead'
        )
        expect(output).toContain(
          'Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images.'
        )
        expect(output).toContain('Warning: Do not include stylesheets manually')
        expect(output).toContain(
          'Warning: Synchronous scripts should not be used'
        )
        expect(output).toContain(
          'Warning: `rel="preconnect"` is missing from Google Font'
        )

        // Files in app, pages, components, lib, and src directories are linted
        expect(output).toContain('pages/_document.js')
        expect(output).toContain('components/bar.js')
        expect(output).toContain('lib/foo.js')
        expect(output).toContain('src/index.js')
        expect(output).toContain('app/layout.js')
      })

      test('custom directories', async () => {
        const { stdout, stderr } = await nextBuild(dirCustomDirectories, [], {
          stdout: true,
          stderr: true,
          lint: true,
        })

        const output = stdout + stderr
        expect(output).toContain('Failed to compile')
        expect(output).toContain(
          'Error: Comments inside children section of tag should be placed inside braces'
        )
        expect(output).toContain(
          'Warning: Synchronous scripts should not be used.'
        )
      })

      test('invalid older eslint version', async () => {
        const { stdout, stderr } = await nextBuild(
          dirInvalidOlderEslintVersion,
          [],
          {
            stdout: true,
            stderr: true,
            lint: true,
          }
        )

        const output = stdout + stderr
        expect(output).toContain(
          'Your project has an older version of ESLint installed'
        )
      })

      test('empty directories do not fail the build', async () => {
        const { stdout, stderr } = await nextBuild(dirEmptyDirectory, [], {
          stdout: true,
          stderr: true,
          lint: true,
        })

        const output = stdout + stderr
        expect(output).not.toContain('Build error occurred')
        expect(output).not.toContain('NoFilesFoundError')
        expect(output).toContain(
          'Warning: Synchronous scripts should not be used.'
        )
        expect(output).toContain('Compiled successfully')
      })

      test('eslint ignored directories do not fail the build', async () => {
        const { stdout, stderr } = await nextBuild(dirEslintIgnore, [], {
          stdout: true,
          stderr: true,
          lint: true,
        })

        const output = stdout + stderr
        expect(output).not.toContain('Build error occurred')
        expect(output).not.toContain('AllFilesIgnoredError')
        expect(output).toContain(
          'Warning: Synchronous scripts should not be used.'
        )
        expect(output).toContain('Compiled successfully')
      })

      test('missing Next.js plugin', async () => {
        const { stdout, stderr } = await nextBuild(dirNoEslintPlugin, [], {
          stdout: true,
          stderr: true,
          lint: true,
        })

        const output = stdout + stderr
        expect(output).toContain(
          'The Next.js plugin was not detected in your ESLint configuration'
        )
      })

      test('eslint caching is enabled', async () => {
        const cacheDir = join(dirEslintCache, '.next', 'cache')

        await fs.remove(cacheDir)
        await nextBuild(dirEslintCache, [], {
          lint: true,
        })

        const files = await fs.readdir(join(cacheDir, 'eslint/'))
        const cacheExists = files.some((f) => /\.cache/.test(f))

        expect(cacheExists).toBe(true)
      })

      test('eslint cache lives in the user defined build directory', async () => {
        const oldCacheDir = join(dirEslintCacheCustomDir, '.next', 'cache')
        const newCacheDir = join(dirEslintCacheCustomDir, 'build', 'cache')

        await fs.remove(oldCacheDir)
        await fs.remove(newCacheDir)

        await nextBuild(dirEslintCacheCustomDir, [], {
          lint: true,
        })

        expect(fs.existsSync(oldCacheDir)).toBe(false)

        const files = await fs.readdir(join(newCacheDir, 'eslint/'))
        const cacheExists = files.some((f) => /\.cache/.test(f))

        expect(cacheExists).toBe(true)
      })
    }
  )
})
