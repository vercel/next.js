/* eslint-env jest */
import { nextServer } from 'next-test-utils'
import { join } from 'path'
const appDir = join(__dirname, '../')
jest.setTimeout(1000 * 60 * 5)

describe('Production Usage without production build', () => {
  it('should show error when there is no production build', async () => {
    await expect(async () => {
      const srv = nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
      })
      await srv.prepare()
    }).rejects.toThrow(/Could not find a production build in the/)
  })
})
