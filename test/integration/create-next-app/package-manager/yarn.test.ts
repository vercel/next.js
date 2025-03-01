import {
  command,
  DEFAULT_FILES,
  FULL_EXAMPLE_PATH,
  projectFilesShouldExist,
  run,
  useTempDir,
} from '../utils'

const lockFile = 'yarn.lock'
const files = [...DEFAULT_FILES, lockFile]

describe('create-next-app with package manager yarn', () => {
  let nextTgzFilename: string

  beforeAll(async () => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')

    await command('yarn', ['--version'])
      // install yarn if not available
      .catch(() =>
        command('corepack', ['prepare', '--activate', 'yarn@1.22.19'])
      )
      .catch(() => command('npm', ['i', '-g', 'yarn']))
  })

  it('should use yarn for --use-yarn flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-yarn'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use-yarn',
          '--no-turbopack',
          '--no-eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files,
      })
    })
  })

  it('should use yarn when user-agent is yarn', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-yarn'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-turbopack',
          '--no-eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
          env: { npm_config_user_agent: 'yarn' },
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files,
      })
    })
  })

  it('should use yarn for --use-yarn flag with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-yarn-with-example'
      const res = await run(
        [projectName, '--use-yarn', '--example', FULL_EXAMPLE_PATH],
        nextTgzFilename,
        { cwd }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files,
      })
    })
  })

  it('should use yarn when user-agent is yarn with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-yarn-with-example'
      const res = await run(
        [projectName, '--example', FULL_EXAMPLE_PATH],
        nextTgzFilename,
        {
          cwd,
          env: { npm_config_user_agent: 'yarn' },
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files,
      })
    })
  })
})
