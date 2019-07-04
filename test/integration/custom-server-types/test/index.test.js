/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { buildTS } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '../')

describe('Custom Server TypeScript', () => {
  it('should build server.ts correctly', async () => {
    await buildTS([], appDir)
  })
})
