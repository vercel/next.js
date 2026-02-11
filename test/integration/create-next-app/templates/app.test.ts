import {
  projectShouldHaveNoGitChanges,
  shouldBeTemplateProject,
  tryNextDev,
  run,
  useTempDir,
} from '../utils'

describe('create-next-app --app (App Router)', () => {
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
      const projectName = 'app-js'
      const { exitCode } = await run(
        [
          projectName,
          '--js',
          '--app',
          '--eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

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
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(exitCode).toBe(0)
      shouldBeTemplateProject({ cwd, projectName, template: 'app', mode: 'ts' })
      await tryNextDev({ cwd, projectName })
      projectShouldHaveNoGitChanges({ cwd, projectName })
    })
  })

  it('should create project inside "src" directory with --src-dir flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-src-dir'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
          stdio: 'inherit',
        }
      )

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
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--src-dir',
          '--tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
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
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--src-dir',
          '--empty',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
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
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--src-dir',
          '--tailwind',
          '--empty',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
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
})
