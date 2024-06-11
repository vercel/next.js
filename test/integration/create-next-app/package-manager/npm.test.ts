import { trace } from 'next/dist/trace'
import {
  DEFAULT_FILES,
  FULL_EXAMPLE_PATH,
  projectFilesShouldExist,
  run,
  useTempDir,
} from '../utils'
import { createNextInstall } from '../../../lib/create-next-install'

const lockFile = 'package-lock.json'
const files = [...DEFAULT_FILES, lockFile]

let nextInstall: Awaited<ReturnType<typeof createNextInstall>>
beforeAll(async () => {
  nextInstall = await createNextInstall({
    parentSpan: trace('test'),
    keepRepoDir: Boolean(process.env.NEXT_TEST_SKIP_CLEANUP),
  })
})

describe.skip('create-next-app with package manager npm', () => {
  it('should use npm for --use-npm flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-npm-flag'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use-npm',
          '--no-turbo',
          '--no-eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        nextInstall.installDir,
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

<<<<<<< HEAD
  it('should use npm for --use npm', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-npm'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use=npm',
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

=======
>>>>>>> 62e8c9dd453839a40627a98803ecf1f0e401eacd
  it('should use npm when user-agent is npm', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-npm'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
<<<<<<< HEAD
=======
          '--no-turbo',
>>>>>>> 62e8c9dd453839a40627a98803ecf1f0e401eacd
          '--no-eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
<<<<<<< HEAD
=======
        nextInstall.installDir,
>>>>>>> 62e8c9dd453839a40627a98803ecf1f0e401eacd
        {
          cwd,
          env: { npm_config_user_agent: 'npm' },
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
<<<<<<< HEAD
        cwd,
        projectName,
        files,
      })
    })
  })

  it('should use npm for --use-npm flag with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-npm-flag-with-example'
      const res = await run(
        [projectName, '--use-npm', '--example', FULL_EXAMPLE_PATH],
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

  it('should use npm for --use npm with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-npm-with-example'
      const res = await run(
        [projectName, '--use=npm', '--example', FULL_EXAMPLE_PATH],
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
      const res = await run([projectName, '--example', FULL_EXAMPLE_PATH], {
        cwd,
        env: { npm_config_user_agent: 'npm' },
      })

=======
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
        nextInstall.installDir,
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
        nextInstall.installDir,
        {
          cwd,
          env: { npm_config_user_agent: 'npm' },
        }
      )

>>>>>>> 62e8c9dd453839a40627a98803ecf1f0e401eacd
      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files,
      })
    })
  })
})
