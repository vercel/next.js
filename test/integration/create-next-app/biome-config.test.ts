import execa from 'execa'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { run, useTempDir } from './utils'

describe('create-next-app Biome configuration', () => {
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

  it('should match biome.json snapshot', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-biome-snapshot'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--biome',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--no-react-compiler',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)
      const biomeConfig = await readFile(join(projectDir, 'biome.json'), 'utf8')

      expect(biomeConfig).toMatchSnapshot()
    })
  })

  it('should run biome check successfully on generated TypeScript project', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-biome-ts-check'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--biome',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--no-react-compiler',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Run biome check on the generated project
      const { exitCode: biomeExitCode, stdout } = await execa(
        'npm',
        ['run', 'lint'],
        {
          cwd: projectDir,
        }
      )

      expect(biomeExitCode).toBe(0)
      expect(stdout).toContain('Checked')
    })
  })

  it('should run biome check successfully on generated JavaScript project', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-biome-js-check'
      const { exitCode } = await run(
        [
          projectName,
          '--js',
          '--biome',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--no-react-compiler',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Run biome check on the generated project
      const { exitCode: biomeExitCode, stdout } = await execa(
        'npm',
        ['run', 'lint'],
        {
          cwd: projectDir,
        }
      )

      expect(biomeExitCode).toBe(0)
      expect(stdout).toContain('Checked')
    })
  })

  it('should format code with biome successfully', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-biome-format'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--biome',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--no-react-compiler',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Run biome format on the generated project
      const { exitCode: biomeFormatCode, stdout } = await execa(
        'npm',
        ['run', 'format'],
        {
          cwd: projectDir,
        }
      )

      expect(biomeFormatCode).toBe(0)
      expect(stdout).toContain('Formatted')
    })
  })

  it('should show errors when biome detects issues', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-biome-errors'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--biome',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--no-react-compiler',
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

      // Run biome check on the project with the problematic file
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
