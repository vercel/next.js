/* eslint-env jest */

import { join } from 'path'
import { buildTS } from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('Custom Server TypeScript', () => {
  it('should build server.ts correctly', async () => {
    await buildTS([], appDir)
  })
})
