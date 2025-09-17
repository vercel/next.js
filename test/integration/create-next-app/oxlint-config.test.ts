import execa from 'execa'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { run, useTempDir } from './utils'

describe('create-next-app Oxlint configuration', () => {
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
})
