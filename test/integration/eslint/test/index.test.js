import { join } from 'path'
import { nextBuild, nextLint } from 'next-test-utils'
import { writeFile, readFile } from 'fs-extra'

import semver from 'next/dist/compiled/semver'

jest.setTimeout(1000 * 60 * 2)

const dirFirstTimeSetup = join(__dirname, '../first-time-setup')
const dirCustomConfig = join(__dirname, '../custom-config')

async function eslintVersion() {
  const eslint = require.resolve('eslint')
  const { ESLint, Linter } = await import(eslint)

  if (!ESLint && !Linter) return null // A very old version (<v4) if both ESLint and Linter properties are not present

  return ESLint ? ESLint.version : Linter.version
}

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
      const version = await eslintVersion()

      if (!version || (version && semver.lt(version, '7.0.0'))) {
        expect(output).toContain(
          'Your project has an older version of ESLint installed'
        )
        expect(output).toContain('Please upgrade to v7 or later')
      } else {
        expect(output).toContain(
          'Error: Comments inside children section of tag should be placed inside braces'
        )
      }
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
      const version = await eslintVersion()

      if (!version || (version && semver.lt(version, '7.0.0'))) {
        expect(output).toContain(
          'Your project has an older version of ESLint installed'
        )
        expect(output).toContain('Please upgrade to v7 or later')
      } else {
        expect(output).toContain(
          'Error: Comments inside children section of tag should be placed inside braces'
        )
      }
    })
  })
})
