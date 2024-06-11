import { trace } from 'next/dist/trace'
import { createNextInstall } from '../../../lib/create-next-install'
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

let nextInstall: Awaited<ReturnType<typeof createNextInstall>>
beforeAll(async () => {
  nextInstall = await createNextInstall({
    parentSpan: trace('test'),
    keepRepoDir: Boolean(process.env.NEXT_TEST_SKIP_CLEANUP),
  })
})

beforeEach(async () => {
  await command('pnpm', ['--version'])
    // install pnpm if not available
    .catch(() => command('corepack', ['prepare', '--activate', 'pnpm@latest']))
    .catch(() => command('npm', ['i', '-g', 'pnpm']))
})

describe.skip('create-next-app with package manager pnpm', () => {
  it('should use pnpm for --use-pnpm flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm-flag'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use-pnpm',
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
  it('should use pnpm for --use pnpm', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--use=pnpm',
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
  it('should use pnpm when user-agent is pnpm', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-pnpm'
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
          env: { npm_config_user_agent: 'pnpm' },
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

  it('should use pnpm for --use-pnpm flag with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm-flag-with-example'
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

  it('should use pnpm for --use pnpm with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm-with-example'
      const res = await run(
        [projectName, '--use=pnpm', '--example', FULL_EXAMPLE_PATH],
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

=======
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

  it('should use pnpm when user-agent is pnpm with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'user-agent-pnpm-with-example'
      const res = await run(
        [projectName, '--example', FULL_EXAMPLE_PATH],
        nextInstall.installDir,
        {
          cwd,
          env: { npm_config_user_agent: 'pnpm' },
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
