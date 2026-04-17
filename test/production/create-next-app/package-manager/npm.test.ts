import {
  DEFAULT_FILES,
  FULL_EXAMPLE_PATH,
  projectFilesShouldExist,
  resolveNextTgzFilename,
  run,
  useTempDir,
} from '../utils'

const lockFile = 'package-lock.json'
const files = [...DEFAULT_FILES, lockFile]

describe('create-next-app with package manager npm', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    nextTgzFilename = resolveNextTgzFilename()
  })

  it('should use npm for --use-npm flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-npm'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use-npm',
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

  it('should use npm when user-agent is npm', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-npm'
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
          env: { npm_config_user_agent: 'npm' },
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

  it('should use npm for --use-npm flag with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-npm-with-example'
      const res = await run(
        [projectName, '--use-npm', '--example', FULL_EXAMPLE_PATH],
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

  it('should use npm when user-agent is npm with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-npm-with-example'
      const res = await run(
        [projectName, '--example', FULL_EXAMPLE_PATH],
        nextTgzFilename,
        {
          cwd,
          env: { npm_config_user_agent: 'npm' },
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
