/* eslint-env jest */
import { nextServer } from 'next-test-utils'
import { join } from 'path'
const appDir = join(__dirname, '../')
jest.setTimeout(1000 * 60 * 5)

describe('Production Usage', () => {
  it('should show error when there is no production build', async () => {
    expect(() => {
      nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
      })
    }).toThrow(/Could not find a valid build in the/)
  })
})
