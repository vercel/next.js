/* eslint-env jest */
/* global jasmine */
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '../')

describe('TypeScript onlyRemoveTypeImports', () => {
  it('should not elide the UserStatistics import', async () => {
    const { code } = await nextBuild(appDir)

    expect(code).toBe(0)
  })
})
