/* eslint-env jest */
import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { nextBuild } from 'next-test-utils'

const access = promisify(fs.access)
const serverPath = join(__dirname, '../bundles/server.html')
const clientPath = join(__dirname, '../bundles/client.html')

describe('Configuration', () => {
  afterAll(async () => {
    try {
      // Clean up
      fs.unlinkSync(serverPath)
      fs.unlinkSync(clientPath)
    } catch (_) {}
  })

  describe('Bundle Analyzer Plugin', () => {
    it('should build with analyzing enabled', async () => {
      await nextBuild(join(__dirname, '..'))
      expect(await access(serverPath)).toBe(undefined)
      expect(await access(clientPath)).toBe(undefined)
    })
  })
})
