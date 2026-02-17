import execa from 'execa'
import { readFile, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { run, useTempDir } from './utils'

describe('create-next-app Oxlint and Oxfmt configuration', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')
  })

  it('should match .oxlintrc.json snapshot', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-oxlint-snapshot'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--oxlint',
          '--no-oxfmt',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)
      const oxlintConfig = await readFile(
        join(projectDir, '.oxlintrc.json'),
        'utf8'
      )

      expect(oxlintConfig).toMatchSnapshot()
    })
  })

  it('should run oxlint check successfully on generated TypeScript project', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-oxlint-ts-check'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--oxlint',
          '--no-oxfmt',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Run oxlint on the generated project
      const { exitCode: oxlintExitCode, stdout } = await execa(
        'npm',
        ['run', 'lint'],
        {
          cwd: projectDir,
        }
      )

      expect(oxlintExitCode).toBe(0)
      expect(stdout).toContain('Checked')
    })
  })

  it('should run oxlint check successfully on generated JavaScript project', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-oxlint-js-check'
      const { exitCode } = await run(
        [
          projectName,
          '--js',
          '--oxlint',
          '--no-oxfmt',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Run oxlint on the generated project
      const { exitCode: oxlintExitCode, stdout } = await execa(
        'npm',
        ['run', 'lint'],
        {
          cwd: projectDir,
        }
      )

      expect(oxlintExitCode).toBe(0)
      expect(stdout).toContain('Checked')
    })
  })

  it('should show errors when oxlint detects issues', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-oxlint-errors'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--oxlint',
          '--no-oxfmt',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Add a file with linting issues
      const problematicFile = join(projectDir, 'app', 'problematic.tsx')
      await writeFile(
        problematicFile,
        `export default function Component() {
  var unusedVar = 5;
  const a = 1
  const b = 2
  
  // Double equals instead of triple
  if (a == b) {
    console.log("test")
  }
  
  // Debugger statement
  debugger;
  
  return <div>Test</div>
}`
      )

      // Run oxlint on the project with the problematic file
      try {
        await execa('npm', ['run', 'lint'], {
          cwd: projectDir,
        })
        // If we get here, the command succeeded when it shouldn't have
        expect(true).toBe(false) // Force test to fail
      } catch (error) {
        // The command should fail with exit code 1
        expect(error.exitCode).toBe(1)
        expect(error.stdout + error.stderr).toContain('problematic.tsx')
        // Check for specific error messages
        const output = error.stdout + error.stderr
        expect(output).toMatch(/debugger|no-debugger/)
      }
    })
  })

  it('should create .oxfmtrc.json when --oxfmt flag is used', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-oxfmt-config'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--oxlint',
          '--oxfmt',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Check that .oxfmtrc.json exists
      await expect(
        access(join(projectDir, '.oxfmtrc.json'))
      ).resolves.not.toThrow()

      const oxfmtConfig = await readFile(
        join(projectDir, '.oxfmtrc.json'),
        'utf8'
      )

      expect(oxfmtConfig).toMatchSnapshot()
    })
  })

  it('should match .oxfmtrc.json snapshot with Tailwind config', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-oxfmt-tailwind'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--oxlint',
          '--oxfmt',
          '--tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)
      const oxfmtConfig = await readFile(
        join(projectDir, '.oxfmtrc.json'),
        'utf8'
      )

      // Tailwind config should have experimentalTailwindcss enabled
      expect(oxfmtConfig).toContain('experimentalTailwindcss')
      expect(oxfmtConfig).toMatchSnapshot()
    })
  })

  it('should not create .oxfmtrc.json when --no-oxfmt flag is used', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-no-oxfmt'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--oxlint',
          '--no-oxfmt',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Check that .oxfmtrc.json does NOT exist
      await expect(access(join(projectDir, '.oxfmtrc.json'))).rejects.toThrow()
    })
  })

  it('should run oxfmt format check successfully on generated project', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-oxfmt-format'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--oxlint',
          '--oxfmt',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Run oxfmt check on the generated project
      const { exitCode: oxfmtExitCode } = await execa(
        'npm',
        ['run', 'format:check'],
        {
          cwd: projectDir,
        }
      )

      expect(oxfmtExitCode).toBe(0)
    })
  })

  it('should include format scripts in package.json when oxfmt is enabled', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-oxfmt-scripts'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--oxlint',
          '--oxfmt',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)
      const packageJson = JSON.parse(
        await readFile(join(projectDir, 'package.json'), 'utf8')
      )

      expect(packageJson.scripts.format).toBe('oxfmt --write')
      expect(packageJson.scripts['format:check']).toBe('oxfmt --check')
      expect(packageJson.devDependencies.oxfmt).toBeDefined()
    })
  })
})
