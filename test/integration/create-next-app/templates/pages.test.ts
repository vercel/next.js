import {
  createNextApp,
  shouldBeTemplateProject,
  spawnExitPromise,
  tryNextDev,
  useTempDir,
} from '../utils'

let testVersion
beforeAll(async () => {
  // TODO: investigate moving this post publish or create deployed GH#57025
  // tarballs to avoid these failing while a publish is in progress
  testVersion = 'canary'
  // const span = new Span({ name: 'parent' })
  // testVersion = (
  //   await createNextInstall({ onlyPackages: true, parentSpan: span })
  // ).get('next')
})

describe('create-next-app --no-app (Pages Router)', () => {
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
      await tryNextDev({
        cwd,
        projectName,
        isApp: false,
      })
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
})
