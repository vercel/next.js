import { join } from 'path'
import { runNextCommand } from 'next-test-utils'
import { writeFile, readFile } from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const dirFirstTimeSetup = join(__dirname, '../first-time-setup')
const dirCustomConfig = join(__dirname, '../custom-config')

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

  if (process.env.TEST_ESLINT) {
    test('shows warnings and errors', async () => {
      const { stderr } = await runNextCommand(['build', dirCustomConfig], {
        stderr: true,
      })

      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain(
        `Error: A synchronous script tag can impact your webpage's performance  @next/next/no-sync-scripts`
      )
    })
  } else {
    it('should skip testing eslint without process.env.TEST_ESLINT set', () => {})
  }
})
