import { join } from 'node:path'
import {
  createNextApp,
  projectShouldHaveNoGitChanges,
  shouldBeTemplateProject,
  spawnExitPromise,
  tryNextDev,
  useTempDir,
} from '../utils'

let testVersion: string
beforeAll(async () => {
  // TODO: investigate moving this post publish or create deployed GH#57025
  // tarballs to avoid these failing while a publish is in progress
  testVersion = 'canary'
  // const span = new Span({ name: 'parent' })
  // testVersion = (
  //   await createNextInstall({ onlyPackages: true, parentSpan: span })
  // ).get('next')
})

describe.skip('create-next-app --no-app (Pages Router)', () => {
  it('should create JavaScript project with --js flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pages-js'
      const childProcess = createNextApp(
        [
          projectName,
          '--js',
          '--no-app',
          '--eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        testVersion
      )
      const exitCode = await spawnExitPromise(childProcess)
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
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-app',
          '--eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        testVersion
      )
      const exitCode = await spawnExitPromise(childProcess)
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
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-app',
          '--eslint',
          '--src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        testVersion
      )
      const exitCode = await spawnExitPromise(childProcess)
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
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-app',
          '--eslint',
          '--src-dir',
          '--tailwind',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        testVersion
      )

      const exitCode = await spawnExitPromise(childProcess)
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
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-app',
          '--eslint',
          '--src-dir',
          '--no-tailwind',
          '--empty',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        testVersion
      )

      const exitCode = await spawnExitPromise(childProcess)
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
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-app',
          '--eslint',
          '--src-dir',
          '--tailwind',
          '--empty',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        testVersion
      )

      const exitCode = await spawnExitPromise(childProcess)
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

  it('should enable turbopack dev with --turbo flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pages-turbo'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-app',
          '--eslint',
          '--turbo',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        testVersion
      )

      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)
      const projectRoot = join(cwd, projectName)
      const pkgJson = require(join(projectRoot, 'package.json'))
      expect(pkgJson.scripts.dev).toBe('next dev --turbo')
    })
  })
})
