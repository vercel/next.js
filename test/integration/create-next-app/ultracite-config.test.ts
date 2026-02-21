import execa from 'execa'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { run, useTempDir } from './utils'

describe('create-next-app Ultracite configuration', () => {
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

  it('should match biome.jsonc snapshot', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-ultracite-snapshot'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--ultracite',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)
      const ultraciteConfig = await readFile(
        join(projectDir, 'biome.jsonc'),
        'utf8'
      )

      expect(ultraciteConfig).toMatchSnapshot()
    })
  })

  it('should fix code with ultracite successfully', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-ultracite-fix'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--ultracite',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Run ultracite fix on the generated project
      const { exitCode: ultraciteFixCode, stdout } = await execa(
        'npm',
        ['run', 'fix'],
        {
          cwd: projectDir,
        }
      )

      expect(ultraciteFixCode).toBe(0)
      expect(stdout).toMatch(/Formatted|Fixed/)
    })
  })

  it('should show errors when ultracite detects issues', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-ultracite-errors'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--ultracite',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
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

      // Run ultracite check on the project with the problematic file
      try {
        await execa('npm', ['run', 'check'], {
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

  it('should include .claude, .cursor, and .vscode directories', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-ultracite-directories'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--ultracite',
          '--no-tailwind',
          '--no-src-dir',
          '--app',
          '--no-turbopack',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Check that configuration directories exist
      const claudeFile = await readFile(
        join(projectDir, '.claude', 'CLAUDE.md'),
        'utf8'
      )
      expect(claudeFile).toContain('Ultracite')

      const vscodeFile = await readFile(
        join(projectDir, '.vscode', 'settings.json'),
        'utf8'
      )
      expect(vscodeFile).toBeTruthy()

      // .cursor directory should exist
      const fs = require('fs')
      const cursorDirExists = fs.existsSync(join(projectDir, '.cursor'))
      expect(cursorDirExists).toBe(true)
    })
  })

  it('should not include ultracite directories when using biome', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-biome-no-ultracite-dirs'
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
          '--no-agents-md',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Check that ultracite-specific files don't exist
      const fs = require('fs')
      const biomejsoncExists = fs.existsSync(join(projectDir, 'biome.jsonc'))
      const claudeDirExists = fs.existsSync(join(projectDir, '.claude'))
      const vscodeDirExists = fs.existsSync(join(projectDir, '.vscode'))
      const cursorDirExists = fs.existsSync(join(projectDir, '.cursor'))

      expect(biomejsoncExists).toBe(false)
      expect(claudeDirExists).toBe(false)
      expect(vscodeDirExists).toBe(false)
      expect(cursorDirExists).toBe(false)

      // But biome.json should exist
      const biomeJsonExists = fs.existsSync(join(projectDir, 'biome.json'))
      expect(biomeJsonExists).toBe(true)
    })
  })
})
