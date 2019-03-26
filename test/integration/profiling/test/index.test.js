/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import fs from 'fs'
const appDir = join(__dirname, '../')
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Profiling Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
  })

  describe('Profiling the build', () => {
    it('should emit files', async () => {
      expect(
        fs.existsSync(join(appDir, '.next', 'profile-events-server.json'))
      ).toBe(true)
      expect(
        fs.existsSync(join(appDir, '.next', 'profile-events-client.json'))
      ).toBe(true)
    })
  })
})
