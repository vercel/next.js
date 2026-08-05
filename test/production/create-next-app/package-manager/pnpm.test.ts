import fs from 'fs'
import path from 'path'
import {
  command,
  DEFAULT_FILES,
  FULL_EXAMPLE_PATH,
  projectFilesShouldExist,
  projectFilesShouldNotExist,
  resolveNextTgzFilename,
  run,
  useTempDir,
} from '../utils'

const lockFile = 'pnpm-lock.yaml'
const files = [...DEFAULT_FILES, lockFile]

// Match the monorepo's pinned pnpm so CNA's `pnpm install` doesn't drift to
// whichever version corepack happens to fetch as "latest" at test time.
const rootPackageManager: string =
  require('../../../../package.json').packageManager

describe('create-next-app with package manager pnpm', () => {
  let nextTgzFilename: string

  beforeAll(async () => {
    nextTgzFilename = resolveNextTgzFilename()
    await command('corepack', ['prepare', '--activate', rootPackageManager])
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
          '--no-linter',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
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
          '--no-linter',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
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
  it('should create pnpm-workspace.yaml with ignoredBuiltDependencies for pnpm v10', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pnpm-v10-workspace'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-linter',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
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
      const workspaceYaml = fs.readFileSync(
        path.join(cwd, projectName, 'pnpm-workspace.yaml'),
        'utf8'
      )
      expect(workspaceYaml).toContain('ignoredBuiltDependencies:')
      expect(workspaceYaml).toContain('- sharp')
      expect(workspaceYaml).toContain('- unrs-resolver')
      expect(workspaceYaml).not.toContain('allowBuilds:')
    })
  })

  it('should create pnpm-workspace.yaml with allowBuilds for pnpm v11+', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'pnpm-v11-workspace'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-linter',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          '--skip-install',
        ],
        nextTgzFilename,
        {
          cwd,
          env: { npm_config_user_agent: 'pnpm/11.0.0 npm/? node/v20.0.0' },
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: ['package.json', 'pnpm-workspace.yaml'],
      })
      const workspaceYaml = fs.readFileSync(
        path.join(cwd, projectName, 'pnpm-workspace.yaml'),
        'utf8'
      )
      expect(workspaceYaml).toContain('allowBuilds:')
      expect(workspaceYaml).toContain('sharp: false')
      expect(workspaceYaml).toContain('unrs-resolver: false')
      expect(workspaceYaml).not.toContain('ignoredBuiltDependencies:')
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
          '--no-linter',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
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
