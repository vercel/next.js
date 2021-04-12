import { join } from 'path'
import { runNextCommand } from 'next-test-utils'
import { writeFile, readFile } from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const dirMissingDeps = join(__dirname, '../missing-deps')
const dirEslintrcConfig = join(__dirname, '../eslintrc-config')

describe('ESLint', () => {
  test('missing dependencies', async () => {
    const { stderr } = await runNextCommand(['build', dirMissingDeps], {
      stderr: true,
    })

    expect(stderr).toContain(
      `It looks like you're trying to use ESLint but do not have the following required package(s) installed:`
    )
    expect(stderr).toContain(
      'Please install all required dependencies by running:'
    )
    expect(stderr).toContain('npx install-peerdeps --dev eslint-config-next')
    expect(stderr).toContain(
      'If you are not trying to use ESLint, please remove the .eslintrc file from your application.'
    )
  })

  test('default eslint config populated automatically', async () => {
    const eslintrc = join(dirEslintrcConfig, '.eslintrc')

    await writeFile(eslintrc, '')

    const { stdout } = await runNextCommand(['build', dirEslintrcConfig], {
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
})
