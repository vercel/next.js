import { join } from 'path'
import { runNextCommand } from 'next-test-utils'
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
  it('should populate eslint config automatically for first time setup', async () => {
    const eslintrc = join(dirFirstTimeSetup, '.eslintrc')
    await writeFile(eslintrc, '')

    const { stdout } = await runNextCommand(['build', dirFirstTimeSetup], {
      stdout: true,
    })

    const eslintrcContent = await readFile(eslintrc, 'utf8')

    expect(stdout).toContain(
      'We detected ESLint in your project and updated the .eslintrc file for you.'
    )
    expect(eslintrcContent.trim().replace(/\s/g, '')).toMatch(
      '{"extends":"next"}'
    )
  })

  test('shows warnings and errors', async () => {
    let output = ''

    const { stdout, stderr } = await runNextCommand(
      ['build', dirCustomConfig],
      {
        stdout: true,
        stderr: true,
      }
    )

    output = stdout + stderr
    const version = await eslintVersion()

    if (!version || (version && semver.lt(version, '7.0.0'))) {
      expect(output).toContain(
        'Your project has an older version of ESLint installed'
      )
      expect(output).toContain(
        'Please upgrade to v7 or later to run ESLint during the build process'
      )
    } else {
      expect(output).toContain('Failed to compile')
      expect(output).toContain(
        'Error: Comments inside children section of tag should be placed inside braces'
      )
    }
  })
})
