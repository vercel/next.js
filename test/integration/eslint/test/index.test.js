import fs from 'fs-extra'
import { join } from 'path'
import findUp from 'next/dist/compiled/find-up'
import { nextBuild, nextLint } from 'next-test-utils'
import { writeFile, readFile } from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const dirFirstTimeSetup = join(__dirname, '../first-time-setup')
const dirCustomConfig = join(__dirname, '../custom-config')
const dirIgnoreDuringBuilds = join(__dirname, '../ignore-during-builds')
const dirCustomDirectories = join(__dirname, '../custom-directories')
const dirConfigInPackageJson = join(__dirname, '../config-in-package-json')

describe('ESLint', () => {
  describe('Next Build', () => {
    test('first time setup', async () => {
      const eslintrc = join(dirFirstTimeSetup, '.eslintrc')
      await writeFile(eslintrc, '')

      const { stdout, stderr } = await nextBuild(dirFirstTimeSetup, [], {
        stdout: true,
        stderr: true,
      })
      const output = stdout + stderr
      const eslintrcContent = await readFile(eslintrc, 'utf8')

      expect(output).toContain(
        'We detected an empty ESLint configuration file (.eslintrc) and updated it for you to include the base Next.js ESLint configuration.'
      )
      expect(eslintrcContent.trim().replace(/\s/g, '')).toMatch(
        '{"extends":"next"}'
      )
    })

    test('shows warnings and errors', async () => {
      const { stdout, stderr } = await nextBuild(dirCustomConfig, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain(
        'Error: Comments inside children section of tag should be placed inside braces'
      )
    })

    test('ignore during builds', async () => {
      const { stdout, stderr } = await nextBuild(dirIgnoreDuringBuilds, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).not.toContain('Failed to compile')
      expect(output).not.toContain(
        'Error: Comments inside children section of tag should be placed inside braces'
      )
    })

    test('custom directories', async () => {
      const { stdout, stderr } = await nextBuild(dirCustomDirectories, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain('Failed to compile')
      expect(output).toContain(
        'Error: Comments inside children section of tag should be placed inside braces'
      )
      expect(output).toContain(
        'Warning: External synchronous scripts are forbidden'
      )
    })
  })

  describe('Next Lint', () => {
    test('first time setup', async () => {
      const eslintrc = join(dirFirstTimeSetup, '.eslintrc')
      await writeFile(eslintrc, '')

      const { stdout, stderr } = await nextLint(dirFirstTimeSetup, [], {
        stdout: true,
        stderr: true,
      })
      const output = stdout + stderr
      const eslintrcContent = await readFile(eslintrc, 'utf8')

      expect(output).toContain(
        'We detected an empty ESLint configuration file (.eslintrc) and updated it for you to include the base Next.js ESLint configuration.'
      )
      expect(eslintrcContent.trim().replace(/\s/g, '')).toMatch(
        '{"extends":"next"}'
      )
    })

    test('shows warnings and errors', async () => {
      const { stdout, stderr } = await nextLint(dirCustomConfig, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain(
        'Error: Comments inside children section of tag should be placed inside braces'
      )
    })

    test('success message when no warnings or errors', async () => {
      const { stdout, stderr } = await nextLint(dirFirstTimeSetup, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain('No ESLint warnings or errors')
    })

    test("don't create .eslintrc file if package.json has eslintConfig field", async () => {
      const eslintrcFile =
        (await findUp(
          [
            '.eslintrc.js',
            '.eslintrc.yaml',
            '.eslintrc.yml',
            '.eslintrc.json',
            '.eslintrc',
          ],
          {
            cwd: '.',
          }
        )) ?? null

      try {
        // If we found a .eslintrc file, it's probably config from root Next.js directory. Rename it during the test
        if (eslintrcFile) {
          await fs.move(eslintrcFile, `${eslintrcFile}.original`)
        }

        const { stdout, stderr } = await nextLint(dirConfigInPackageJson, [], {
          stdout: true,
          stderr: true,
        })

        const output = stdout + stderr
        expect(output).not.toContain(
          'We created the .eslintrc file for you and included the base Next.js ESLint configuration'
        )
      } finally {
        // Restore original .eslintrc file
        if (eslintrcFile) {
          await fs.move(`${eslintrcFile}.original`, eslintrcFile)
        }
      }
    })
  })
})
