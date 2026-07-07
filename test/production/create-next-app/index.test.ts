import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  resolveNextTgzFilename,
  run,
  useTempDir,
  projectFilesShouldExist,
  projectFilesShouldNotExist,
} from './utils'

describe('create-next-app', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    nextTgzFilename = resolveNextTgzFilename()
  })

  it('should not create if the target directory is not empty', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'non-empty-dir'
      await mkdir(join(cwd, projectName))
      const pkg = join(cwd, projectName, 'package.json')
      await writeFile(pkg, `{ "name": "${projectName}" }`)

      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-linter',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
          reject: false,
        }
      )
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toMatch(/contains files that could conflict/)
    })
  })

  it('should not create if the target directory is not writable', async () => {
    const expectedErrorMessage =
      /you do not have write permissions for this folder|EPERM: operation not permitted/

    await useTempDir(async (cwd) => {
      const projectName = 'dir-not-writable'

      // if the folder isn't able to be write restricted we can't test so skip
      if (
        await writeFile(join(cwd, 'test'), 'hello')
          .then(() => true)
          .catch(() => false)
      ) {
        console.warn(
          `Test folder is not write restricted skipping write permission test`
        )
        return
      }

      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
          reject: false,
        }
      )

      expect(res.stderr).toMatch(expectedErrorMessage)
      expect(res.exitCode).toBe(1)
    }, 0o500).catch((err) => {
      if (!expectedErrorMessage.test(err.message)) {
        throw err
      }
    })
  })
  it('should create AGENTS.md and CLAUDE.md with --agents-md flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'with-agents-md'

      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-linter',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--no-react-compiler',
          '--agents-md',
          '--skip-install',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
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
        files: ['AGENTS.md', 'CLAUDE.md'],
      })
    })
  })

  it('should not create AGENTS.md and CLAUDE.md with --no-agents-md flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'without-agents-md'

      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-linter',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          '--skip-install',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )
      expect(res.exitCode).toBe(0)
      projectFilesShouldNotExist({
        cwd,
        projectName,
        files: ['AGENTS.md', 'CLAUDE.md'],
      })
    })
  })

  it('should print assumed defaults when flags are partially provided', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'partial-flags'

      const res = await run(
        [
          projectName,
          '--ts',
          '--tailwind',
          '--app',
          '--skip-install',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
          stdio: 'pipe',
        }
      )
      expect(res.exitCode).toBe(0)

      // Extract the defaults block from stdout
      const defaultsMatch = res.stdout.match(
        /Using defaults for unprovided options:\n\n([\s\S]*?)\n\nCreating/
      )
      expect(defaultsMatch).not.toBeNull()
      expect(defaultsMatch[1]).toMatchInlineSnapshot(`
        "  --eslint                ESLint (use --biome for Biome, --no-eslint for None)
          --no-react-compiler     No React Compiler (use --react-compiler for React Compiler)
          --no-src-dir            No src/ directory (use --src-dir for src/ directory)
          --agents-md             AGENTS.md (use --no-agents-md for No AGENTS.md)
          --import-alias          "@/*""
      `)
    })
  })

  it('should not print assumed defaults when all flags are provided', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'all-flags'

      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          '--skip-install',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
          stdio: 'pipe',
        }
      )
      expect(res.exitCode).toBe(0)
      expect(res.stdout).not.toContain('Using defaults for unprovided options')
    })
  })

  it('should not print assumed defaults with --yes flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'yes-flag'

      const res = await run(
        [projectName, '--yes', '--skip-install'],
        nextTgzFilename,
        {
          cwd,
          stdio: 'pipe',
        }
      )
      expect(res.exitCode).toBe(0)
      expect(res.stdout).not.toContain('Using defaults for unprovided options')
    })
  })

  it('should not install dependencies if --skip-install', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'empty-dir'

      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-linter',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--skip-install',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
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
        files: ['.gitignore', 'package.json'],
      })
      projectFilesShouldNotExist({ cwd, projectName, files: ['node_modules'] })
    })
  })
})
