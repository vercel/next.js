import fs from 'fs-extra'
import os from 'os'

import { join } from 'path'

import findUp from 'next/dist/compiled/find-up'
import { File, nextBuild, nextLint } from 'next-test-utils'

const dirFirstTimeSetup = join(__dirname, '../first-time-setup')
const dirCustomConfig = join(__dirname, '../custom-config')
const dirWebVitalsConfig = join(__dirname, '../config-core-web-vitals')
const dirPluginRecommendedConfig = join(
  __dirname,
  '../plugin-recommended-config'
)
const dirPluginCoreWebVitalsConfig = join(
  __dirname,
  '../plugin-core-web-vitals-config'
)
const dirIgnoreDuringBuilds = join(__dirname, '../ignore-during-builds')
const dirBaseDirectories = join(__dirname, '../base-directories')
const dirBaseDirectoriesConfigFile = new File(
  join(dirBaseDirectories, '/next.config.js')
)
const dirCustomDirectories = join(__dirname, '../custom-directories')
const dirConfigInPackageJson = join(__dirname, '../config-in-package-json')
const dirInvalidOlderEslintVersion = join(
  __dirname,
  '../invalid-eslint-version'
)
const dirMaxWarnings = join(__dirname, '../max-warnings')
const dirEmptyDirectory = join(__dirname, '../empty-directory')
const dirEslintIgnore = join(__dirname, '../eslint-ignore')
const dirNoEslintPlugin = join(__dirname, '../no-eslint-plugin')
const dirNoConfig = join(__dirname, '../no-config')
const dirEslintCache = join(__dirname, '../eslint-cache')
const dirEslintCacheCustomDir = join(__dirname, '../eslint-cache-custom-dir')
const dirFileLinting = join(__dirname, '../file-linting')
const mjsCjsLinting = join(__dirname, '../mjs-cjs-linting')
const dirTypescript = join(__dirname, '../with-typescript')

describe('Next Build', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    test('first time setup', async () => {
      const eslintrcJson = join(dirFirstTimeSetup, '.eslintrc.json')
      await fs.writeFile(eslintrcJson, '')

      const { stdout, stderr } = await nextBuild(dirFirstTimeSetup, [], {
        stdout: true,
        stderr: true,
      })
      const output = stdout + stderr

      expect(output).toContain(
        'No ESLint configuration detected. Run next lint to begin setup'
      )
    })

    test('shows warnings and errors', async () => {
      const { stdout, stderr } = await nextBuild(dirCustomConfig, [], {
        stdout: true,
        stderr: true,
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
      })

      const output = stdout + stderr

      expect(output).toContain('Failed to compile')
      expect(output).toContain(
        'Error: `next/head` should not be imported in `pages/_document.js`. Use `<Head />` from `next/document` instead'
      )
      expect(output).toContain(
        'Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images.'
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
      })

      const output = stdout + stderr
      expect(output).toContain(
        'The Next.js plugin was not detected in your ESLint configuration'
      )
    })

    test('eslint caching is enabled', async () => {
      const cacheDir = join(dirEslintCache, '.next', 'cache')

      await fs.remove(cacheDir)
      await nextBuild(dirEslintCache, [])

      const files = await fs.readdir(join(cacheDir, 'eslint/'))
      const cacheExists = files.some((f) => /\.cache/.test(f))

      expect(cacheExists).toBe(true)
    })

    test('eslint cache lives in the user defined build directory', async () => {
      const oldCacheDir = join(dirEslintCacheCustomDir, '.next', 'cache')
      const newCacheDir = join(dirEslintCacheCustomDir, 'build', 'cache')

      await fs.remove(oldCacheDir)
      await fs.remove(newCacheDir)

      await nextBuild(dirEslintCacheCustomDir, [])

      expect(fs.existsSync(oldCacheDir)).toBe(false)

      const files = await fs.readdir(join(newCacheDir, 'eslint/'))
      const cacheExists = files.some((f) => /\.cache/.test(f))

      expect(cacheExists).toBe(true)
    })
  })
})
