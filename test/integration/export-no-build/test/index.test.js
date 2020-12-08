/* eslint-env jest */
import { nextExport } from 'next-test-utils'
import { join } from 'path'
const appDir = join(__dirname, '../')
jest.setTimeout(1000 * 60 * 5)

describe('next export without build', () => {
  it('should show error when there is no production build', async () => {
    const result = await nextExport(appDir, {}, { stderr: true, stdout: true })
    console.log(result.stdout, result.stderr)
    expect(result.stderr).toMatch(/Could not find a production build in the/)
  })
})
