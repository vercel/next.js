/* eslint-env jest */
import { nextServer } from 'next-test-utils'
import { join } from 'path'
const appDir = join(__dirname, '../')

// force require usage instead of dynamic import in jest
// x-ref: https://github.com/nodejs/node/issues/35889
process.env.__NEXT_TEST_MODE = 'jest'

describe('Production Usage without production build', () => {
  it('should show error when there is no production build', async () => {
    await expect(async () => {
      const srv = nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
        customServer: false,
      })
      await srv.prepare()
    }).rejects.toThrow(/Could not find a production build in the/)
  })
})
