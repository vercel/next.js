/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import fs from 'fs'
const appDir = join(__dirname, '../')
const profileEventsPath = join(appDir, '.next', 'profile-events.json')
jest.setTimeout(1000 * 60 * 5)

// TODO: Make profiling experimental flag work with webpack 5
describe.skip('Profiling Usage', () => {
  beforeAll(async () => {
    // Delete file if it already exists
    if (await fs.existsSync(profileEventsPath))
      await fs.unlink(profileEventsPath, () => {
        console.log('Deleted Existing profile-events.json file')
      })

    await nextBuild(appDir)
  })

  describe('Profiling the build', () => {
    it('should emit files', async () => {
      expect(fs.existsSync(profileEventsPath)).toBe(true)
    })
  })
})
