import { join } from 'path'
import { nextBuild, nextLint } from 'next-test-utils'
import { writeFile, readFile } from 'fs-extra'

import semver from 'next/dist/compiled/semver'

jest.setTimeout(1000 * 60 * 2)

const dirFirstTimeSetup = join(__dirname, '../first-time-setup')
const dirCustomConfig = join(__dirname, '../custom-config')
const dirIgnoreDuringBuilds = join(__dirname, '../ignore-during-builds')

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
  })
})
