import fs from 'fs-extra'
import os from 'os'
import execa from 'execa'

import { dirname, join } from 'path'

import findUp from 'next/dist/compiled/find-up'
import { nextBuild, nextLint } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const dirFirstTimeSetup = join(__dirname, '../first-time-setup')
const dirCustomConfig = join(__dirname, '../custom-config')
const dirWebVitalsConfig = join(__dirname, '../config-core-web-vitals')
const dirPluginRecommendedConfig = join(
  __dirname,
  '../plugin-recommended-config'
)
const dirPluginCoreWebVitalsConfig = join(
  __dirname,
  '../plugin-core-web-vitals-config'
)
const dirIgnoreDuringBuilds = join(__dirname, '../ignore-during-builds')
const dirCustomDirectories = join(__dirname, '../custom-directories')
const dirConfigInPackageJson = join(__dirname, '../config-in-package-json')
const dirInvalidEslintVersion = join(__dirname, '../invalid-eslint-version')
const dirMaxWarnings = join(__dirname, '../max-warnings')
const dirEmptyDirectory = join(__dirname, '../empty-directory')
const dirEslintIgnore = join(__dirname, '../eslint-ignore')
const dirNoEslintPlugin = join(__dirname, '../no-eslint-plugin')
const dirNoConfig = join(__dirname, '../no-config')

describe('ESLint', () => {
  describe('Next Build', () => {
    test('first time setup', async () => {
      const eslintrcJson = join(dirFirstTimeSetup, '.eslintrc.json')
      await fs.writeFile(eslintrcJson, '')

      const { stdout, stderr } = await nextBuild(dirFirstTimeSetup, [], {
        stdout: true,
        stderr: true,
      })
      const output = stdout + stderr

      expect(output).toContain(
        'No ESLint configuration detected. Run next lint to begin setup'
      )
    })

    test('shows warnings and errors', async () => {
      const { stdout, stderr } = await nextBuild(dirCustomConfig, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain(
        'Warning: External synchronous scripts are forbidden'
      )
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

    test('invalid eslint version', async () => {
      const { stdout, stderr } = await nextBuild(dirInvalidEslintVersion, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain(
        'Your project has an older version of ESLint installed'
      )
    })

    test('empty directories do not fail the build', async () => {
      const { stdout, stderr } = await nextBuild(dirEmptyDirectory, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).not.toContain('Build error occurred')
      expect(output).not.toContain('NoFilesFoundError')
      expect(output).toContain(
        'Warning: External synchronous scripts are forbidden'
      )
      expect(output).toContain('Compiled successfully')
    })

    test('eslint ignored directories do not fail the build', async () => {
      const { stdout, stderr } = await nextBuild(dirEslintIgnore, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).not.toContain('Build error occurred')
      expect(output).not.toContain('AllFilesIgnoredError')
      expect(output).toContain(
        'Warning: External synchronous scripts are forbidden'
      )
      expect(output).toContain('Compiled successfully')
    })

    test('missing Next.js plugin', async () => {
      const { stdout, stderr } = await nextBuild(dirNoEslintPlugin, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain(
        'The Next.js plugin was not detected in your ESLint configuration'
      )
    })
  })

  describe('Next Lint', () => {
    describe('First Time Setup ', () => {
      async function nextLintTemp() {
        const folder = join(
          os.tmpdir(),
          Math.random().toString(36).substring(2)
        )
        await fs.mkdirp(folder)
        await fs.copy(dirNoConfig, folder)

        try {
          const nextDir = dirname(require.resolve('next/package'))
          const nextBin = join(nextDir, 'dist/bin/next')

          const { stdout } = await execa('node', [
            nextBin,
            'lint',
            folder,
            '--strict',
          ])

          const pkgJson = JSON.parse(
            await fs.readFile(join(folder, 'package.json'), 'utf8')
          )
          const eslintrcJson = JSON.parse(
            await fs.readFile(join(folder, '.eslintrc.json'), 'utf8')
          )

          return { stdout, pkgJson, eslintrcJson }
        } finally {
          await fs.remove(folder)
        }
      }

      test('show a prompt to set up ESLint if no configuration detected', async () => {
        const eslintrcJson = join(dirFirstTimeSetup, '.eslintrc.json')
        await fs.writeFile(eslintrcJson, '')

        const { stdout, stderr } = await nextLint(dirFirstTimeSetup, [], {
          stdout: true,
          stderr: true,
        })
        const output = stdout + stderr
        expect(output).toContain('How would you like to configure ESLint?')

        // Different options that can be selected
        expect(output).toContain('Strict (recommended)')
        expect(output).toContain('Base')
        expect(output).toContain('Cancel')
      })

      test('installs eslint and eslint-config-next as devDependencies if missing', async () => {
        const { stdout, pkgJson } = await nextLintTemp()

        expect(stdout.replace(/(\r\n|\n|\r)/gm, '')).toContain(
          'Installing devDependencies:- eslint- eslint-config-next'
        )
        expect(pkgJson.devDependencies).toHaveProperty('eslint')
        expect(pkgJson.devDependencies).toHaveProperty('eslint-config-next')
      })

      test('creates .eslintrc.json file with a default configuration', async () => {
        const { stdout, eslintrcJson } = await nextLintTemp()

        expect(stdout).toContain(
          'We created the .eslintrc.json file for you and included your selected configuration'
        )
        expect(eslintrcJson).toMatchObject({ extends: 'next/core-web-vitals' })
      })

      test('shows a successful message when completed', async () => {
        const { stdout, eslintrcJson } = await nextLintTemp()

        expect(stdout).toContain(
          'ESLint has successfully been configured. Run next lint again to view warnings and errors'
        )
      })
    })

    test('shows warnings and errors', async () => {
      const { stdout, stderr } = await nextLint(dirCustomConfig, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain(
        'Warning: External synchronous scripts are forbidden'
      )
      expect(output).toContain(
        'Error: Comments inside children section of tag should be placed inside braces'
      )
    })

    test('shows warnings and errors with next/core-web-vitals config', async () => {
      const { stdout, stderr } = await nextLint(dirWebVitalsConfig, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain(
        "Warning: Do not use <img>. Use Image from 'next/image' instead."
      )
      expect(output).toContain(
        'Error: External synchronous scripts are forbidden'
      )
    })

    test('shows warnings and errors when extending plugin recommended config', async () => {
      const { stdout, stderr } = await nextLint(
        dirPluginRecommendedConfig,
        [],
        {
          stdout: true,
          stderr: true,
        }
      )

      const output = stdout + stderr
      expect(output).toContain(
        'Warning: External synchronous scripts are forbidden'
      )
      expect(output).toContain(
        'Error: next/document should not be imported outside of pages/_document.js.'
      )
    })

    test('shows warnings and errors when extending plugin core-web-vitals config', async () => {
      const { stdout, stderr } = await nextLint(
        dirPluginCoreWebVitalsConfig,
        [],
        {
          stdout: true,
          stderr: true,
        }
      )

      const output = stdout + stderr
      expect(output).toContain(
        "Warning: Do not use <img>. Use Image from 'next/image' instead."
      )
      expect(output).toContain(
        'Error: External synchronous scripts are forbidden'
      )
    })

    test('success message when no warnings or errors', async () => {
      const eslintrcJson = join(dirFirstTimeSetup, '.eslintrc.json')
      await fs.writeFile(eslintrcJson, '{ "extends": "next", "root": true }')

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
          'We created the .eslintrc file for you and included your selected configuration'
        )
      } finally {
        // Restore original .eslintrc file
        if (eslintrcFile) {
          await fs.move(`${eslintrcFile}.original`, eslintrcFile)
        }
      }
    })

    test('quiet flag suppresses warnings and only reports errors', async () => {
      const { stdout, stderr } = await nextLint(dirCustomConfig, ['--quiet'], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain(
        'Error: Comments inside children section of tag should be placed inside braces'
      )
      expect(output).not.toContain(
        'Warning: External synchronous scripts are forbidden'
      )
    })

    test('custom directories', async () => {
      const { stdout, stderr } = await nextLint(dirCustomDirectories, [], {
        stdout: true,
        stderr: true,
      })

      const output = stdout + stderr
      expect(output).toContain(
        'Error: Comments inside children section of tag should be placed inside braces'
      )
      expect(output).toContain(
        'Warning: External synchronous scripts are forbidden'
      )
    })

    test('max warnings flag errors when warnings exceed threshold', async () => {
      const { stdout, stderr } = await nextLint(
        dirMaxWarnings,
        ['--max-warnings', 1],
        {
          stdout: true,
          stderr: true,
        }
      )

      expect(stderr).not.toEqual('')
      expect(stderr).toContain(
        'Warning: External synchronous scripts are forbidden'
      )
      expect(stdout).not.toContain(
        'Warning: External synchronous scripts are forbidden'
      )
    })

    test('max warnings flag does not error when warnings do not exceed threshold', async () => {
      const { stdout, stderr } = await nextLint(
        dirMaxWarnings,
        ['--max-warnings', 2],
        {
          stdout: true,
          stderr: true,
        }
      )

      expect(stderr).toEqual('')
      expect(stderr).not.toContain(
        'Warning: External synchronous scripts are forbidden'
      )
      expect(stdout).toContain(
        'Warning: External synchronous scripts are forbidden'
      )
    })

    test('format flag supports additional user-defined formats', async () => {
      const { stdout, stderr } = await nextLint(
        dirMaxWarnings,
        ['-f', 'codeframe'],
        {
          stdout: true,
          stderr: true,
        }
      )

      const output = stdout + stderr
      expect(output).toContain(
        'warning: External synchronous scripts are forbidden'
      )
      expect(stdout).toContain('<script src="https://example.com" />')
      expect(stdout).toContain('2 warnings found')
    })
  })
})
