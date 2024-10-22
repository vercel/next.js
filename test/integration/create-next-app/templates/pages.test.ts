import { join } from 'node:path'
import {
  projectShouldHaveNoGitChanges,
  run,
  shouldBeTemplateProject,
  tryNextDev,
  useTempDir,
} from '../utils'

describe('create-next-app --no-app (Pages Router)', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')
  })

  it('should create JavaScript project with --js flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pages-js'
      const { exitCode } = await run(
        [
          projectName,
          '--js',
          '--no-app',
          '--no-turbopack',
          '--eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'default',
        mode: 'js',
      })
      await tryNextDev({
        cwd,
        projectName,
        isApp: false,
      })
    })
  })

  it('should create TypeScript project with --ts flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pages-ts'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--no-app',
          '--no-turbopack',
          '--eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'default',
        mode: 'ts',
      })
      await tryNextDev({ cwd, projectName, isApp: false })
      await projectShouldHaveNoGitChanges({ cwd, projectName })
    })
  })

  it('should create project inside "src" directory with --src-dir flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pages-src-dir'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--no-app',
          '--no-turbopack',
          '--eslint',
          '--src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'default',
        mode: 'ts',
        srcDir: true,
      })
      await tryNextDev({
        cwd,
        projectName,
        isApp: false,
      })
    })
  })

  it('should create TailwindCSS project with --tailwind flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pages-tw'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--no-app',
          '--no-turbopack',
          '--eslint',
          '--src-dir',
          '--tailwind',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'default-tw',
        mode: 'ts',
        srcDir: true,
      })
      await tryNextDev({
        cwd,
        projectName,
        isApp: false,
      })
    })
  })

  it('should create an empty project with --empty flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pages-empty'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--no-app',
          '--no-turbopack',
          '--eslint',
          '--src-dir',
          '--no-tailwind',
          '--empty',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      const isEmpty = true
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'default-empty',
        mode: 'ts',
        srcDir: true,
      })
      await tryNextDev({
        cwd,
        projectName,
        isApp: false,
        isEmpty,
      })
    })
  })

  it('should create an empty TailwindCSS project with --empty flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pages-tw-empty'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--no-app',
          '--no-turbopack',
          '--eslint',
          '--src-dir',
          '--tailwind',
          '--empty',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      const isEmpty = true
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'default-tw-empty',
        mode: 'ts',
        srcDir: true,
      })
      await tryNextDev({
        cwd,
        projectName,
        isApp: false,
        isEmpty,
      })
    })
  })

  it('should enable turbopack dev with --turbopack flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pages-turbo'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--no-app',
          '--eslint',
          '--turbopack',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(exitCode).toBe(0)
      const projectRoot = join(cwd, projectName)
      const pkgJson = require(join(projectRoot, 'package.json'))
      expect(pkgJson.scripts.dev).toBe('next dev --turbopack')
    })
  })
})
