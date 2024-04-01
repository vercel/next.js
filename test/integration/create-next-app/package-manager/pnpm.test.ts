import {
  command,
  DEFAULT_FILES,
  FULL_EXAMPLE_PATH,
  projectFilesShouldExist,
  run,
  useTempDir,
} from '../utils'

const lockFile = 'pnpm-lock.yaml'
const files = [...DEFAULT_FILES, lockFile]

beforeEach(async () => {
  await command('pnpm', ['--version'])
    // install pnpm if not available
    .catch(() => command('corepack', ['prepare', '--activate', 'pnpm@latest']))
    .catch(() => command('npm', ['i', '-g', 'pnpm']))
})

describe('create-next-app with package manager pnpm', () => {
  it('should use pnpm for --use-pnpm flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use-pnpm',
          '--no-eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
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
})

it('should use pnpm when user-agent is pnpm', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-pnpm'
    const res = await run(
      [
        projectName,
        '--ts',
        '--app',
        '--no-eslint',
        '--no-src-dir',
        '--no-tailwind',
        '--no-import-alias',
      ],
      {
        cwd,
        env: { npm_config_user_agent: 'pnpm' },
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

it('should use pnpm for --use-pnpm flag with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-pnpm-with-example'
    const res = await run(
      [projectName, '--use-pnpm', '--example', FULL_EXAMPLE_PATH],
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

it('should use pnpm when user-agent is pnpm with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-pnpm-with-example'
    const res = await run([projectName, '--example', FULL_EXAMPLE_PATH], {
      cwd,
      env: { npm_config_user_agent: 'pnpm' },
    })

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files,
    })
  })
})
