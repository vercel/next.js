/* eslint-env jest */

import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
describe('TypeScript filtered files', () => {
  it('should fail to build the app with a file named con*test*.js', async () => {
    const output = await nextBuild(appDir, [], { stdout: true, stderr: true })
    expect(output.stdout).not.toMatch(/Compiled successfully/)
    expect(output.code).toBe(1)
    expect(output.stderr).toMatch(/Failed to compile/)
    expect(output.stderr).toMatch(/is not assignable to type 'boolean'/)
  })
})
