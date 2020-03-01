/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Babel', () => {
  it('should allow setting targets.browsers', async () => {
    await nextBuild(join(__dirname, '../fixtures/targets-browsers'))
  })

  it('should allow setting targets to a string', async () => {
    await nextBuild(join(__dirname, '../fixtures/targets-string'))
  })
})
