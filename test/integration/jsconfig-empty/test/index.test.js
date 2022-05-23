/* eslint-env jest */
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')

describe('Empty JSConfig Support', () => {
  test('should compile successfully', async () => {
    const { code, stdout } = await nextBuild(appDir, [], {
      stdout: true,
    })
    expect(code).toBe(0)
    expect(stdout).toMatch(/Compiled successfully/)
  })
})
