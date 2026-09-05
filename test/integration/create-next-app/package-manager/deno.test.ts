import execa from 'execa'
import {
  command,
  DEFAULT_FILES,
  FULL_EXAMPLE_PATH,
  projectFilesShouldExist,
  run,
  useTempDir,
} from '../utils'

describe('create-next-app with package manager deno', () => {
  let nextTgzFilename: string
  let files: string[]

  beforeAll(async () => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')

    await command('deno', ['--version'])
      // install deno if not available
      .catch(() => command('npm', ['i', '-g', 'deno']))

    const denoVersion = (await execa('deno', ['--version'])).stdout.trim()
    // Some CI runners pre-install Deno.
    // Locally, we don't pin Deno either.
    const lockFile = 'deno.lock'
    files = [...DEFAULT_FILES, lockFile]
  })

  it('should use deno for --use-deno flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-deno'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use-deno',
          '--no-turbopack',
          '--no-linter',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
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

  it('should use deno when user-agent is deno', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-deno'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-turbopack',
          '--no-linter',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
        ],
        nextTgzFilename,
        {
          cwd,
          env: { npm_config_user_agent: 'deno' },
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

  it('should use deno for --use-deno flag with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-deno-with-example'
      const res = await run(
        [projectName, '--use-deno', '--example', FULL_EXAMPLE_PATH],
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

  it('should use deno when user-agent is deno with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-deno-with-example'
      const res = await run(
        [projectName, '--example', FULL_EXAMPLE_PATH],
        nextTgzFilename,
        {
          cwd,
          env: { npm_config_user_agent: 'deno' },
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
