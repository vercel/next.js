import {
  command,
  DEFAULT_FILES,
  FULL_EXAMPLE_PATH,
  projectFilesShouldExist,
  run,
  useTempDir,
} from '../utils'

const lockFile = 'bun.lockb'
const files = [...DEFAULT_FILES, lockFile]

describe('create-next-app with package manager bun', () => {
  let nextTgzFilename: string

  beforeAll(async () => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')

    await command('bun', ['--version'])
      // install bun if not available
      .catch(() => command('npm', ['i', '-g', 'bun']))
  })

  it('should use bun for --use-bun flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-bun'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use-bun',
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

  it('should use bun when user-agent is bun', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-bun'
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
          env: { npm_config_user_agent: 'bun' },
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

  it('should use bun for --use-bun flag with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-bun-with-example'
      const res = await run(
        [projectName, '--use-bun', '--example', FULL_EXAMPLE_PATH],
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

  it('should use bun when user-agent is bun with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-bun-with-example'
      const res = await run(
        [projectName, '--example', FULL_EXAMPLE_PATH],
        nextTgzFilename,
        {
          cwd,
          env: { npm_config_user_agent: 'bun' },
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
