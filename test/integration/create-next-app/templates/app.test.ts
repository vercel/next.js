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
  if (testVersion) return
  // TODO: investigate moving this post publish or create deployed GH#57025
  // tarballs to avoid these failing while a publish is in progress
  testVersion = 'canary'
  // const span = new Span({ name: 'parent' })
  // testVersion = (
  //   await createNextInstall({ onlyPackages: true, parentSpan: span })
  // ).get('next')
})

describe('create-next-app --app (App Router)', () => {
  it('should create JavaScript project with --js flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-js'
      const childProcess = createNextApp(
        [
          projectName,
          '--js',
          '--app',
          '--no-turbo',
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
      shouldBeTemplateProject({ cwd, projectName, template: 'app', mode: 'js' })
      await tryNextDev({
        cwd,
        projectName,
      })
    })
  })

  it('should create TypeScript project with --ts flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-ts'
      const cp = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
          '--no-turbo',
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

      const exitCode = await spawnExitPromise(cp)
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({ cwd, projectName, template: 'app', mode: 'ts' })
      await tryNextDev({ cwd, projectName })
      projectShouldHaveNoGitChanges({ cwd, projectName })
    })
  })

  it('should create project inside "src" directory with --src-dir flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-src-dir'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
          '--no-turbo',
          '--eslint',
          '--src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        {
          cwd,
          stdio: 'inherit',
        },
        testVersion
      )

      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'app',
        mode: 'ts',
        srcDir: true,
      })
      await tryNextDev({
        cwd,
        projectName,
      })
    })
  })

  it('should create TailwindCSS project with --tailwind flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-tw'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
          '--no-turbo',
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
        template: 'app-tw',
        mode: 'ts',
        srcDir: true,
      })
      await tryNextDev({
        cwd,
        projectName,
      })
    })
  })

  it('should create an empty project with --empty flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-empty'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
          '--no-turbo',
          '--eslint',
          '--src-dir',
          '--empty',
          '--no-tailwind',
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
        template: 'app-empty',
        mode: 'ts',
        srcDir: true,
      })
      await tryNextDev({
        cwd,
        projectName,
        isEmpty,
      })
    })
  })

  it('should create an empty TailwindCSS project with --empty flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-tw-empty'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
          '--no-turbo',
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
        template: 'app-tw-empty',
        mode: 'ts',
        srcDir: true,
      })
      await tryNextDev({
        cwd,
        projectName,
        isEmpty,
      })
    })
  })

  it('should enable turbopack dev with --turbo flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-turbo'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
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
