import {
  DEFAULT_FILES,
  FULL_EXAMPLE_PATH,
  projectFilesShouldExist,
  projectFilesShouldNotExist,
  run,
  useTempDir,
} from '../utils'

const lockFile = 'pnpm-lock.yaml'
const files = [...DEFAULT_FILES, lockFile]

describe('create-next-app with package manager pnpm', () => {
  let nextTgzFilename: string

  beforeAll(async () => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')
  })

  it('should use pnpm for --use-pnpm flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use-pnpm',
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

  it('should use pnpm when user-agent is pnpm', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-pnpm'
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

  // These tests use --skip-install because:
  // 1. We only need to verify the workspace file is created/not created
  // 2. The CI runs pnpm v9, but when testing v10 behavior, the workspace file
  //    created for v10 (without packages field) would fail with pnpm v9
  it('should create pnpm-workspace.yaml for pnpm v10+', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pnpm-v10-workspace'
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
          '--skip-install',
        ],
        nextTgzFilename,
        {
          cwd,
          env: { npm_config_user_agent: 'pnpm/10.0.0 npm/? node/v20.0.0' },
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: ['package.json', 'pnpm-workspace.yaml'],
      })
    })
  })

  it('should NOT create pnpm-workspace.yaml for pnpm v9', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pnpm-v9-no-workspace'
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
          '--skip-install',
        ],
        nextTgzFilename,
        {
          cwd,
          env: { npm_config_user_agent: 'pnpm/9.13.2 npm/? node/v20.0.0' },
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldNotExist({
        cwd,
        projectName,
        files: ['pnpm-workspace.yaml'],
      })
    })
  })

  it('should use pnpm for --use-pnpm flag with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm-with-example'
      const res = await run(
        [projectName, '--use-pnpm', '--example', FULL_EXAMPLE_PATH],
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

  it('should use pnpm when user-agent is pnpm with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-pnpm-with-example'
      const res = await run(
        [projectName, '--example', FULL_EXAMPLE_PATH],
        nextTgzFilename,
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
})
