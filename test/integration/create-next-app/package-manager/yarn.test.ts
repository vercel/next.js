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

// Don't install local next build here as yarn will error with:
// Usage Error: This project is configured to use pnpm

beforeEach(async () => {
  await command('yarn', ['--version'])
    // install yarn if not available
    .catch(() => command('corepack', ['prepare', '--activate', 'yarn@1.22.19']))
    .catch(() => command('npm', ['i', '-g', 'yarn']))
})

describe.skip('create-next-app with package manager yarn', () => {
  it('should use yarn for --use-yarn flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-yarn'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use-yarn',
          '--no-turbo',
          '--no-eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        'canary',
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
          '--no-turbo',
          '--no-eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        'canary',
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
        'canary',
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
        'canary',
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
