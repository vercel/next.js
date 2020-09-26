/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')

describe('i18n Support', () => {
  it('builds successfully', async () => {
    await nextBuild(appDir)
  })
})
