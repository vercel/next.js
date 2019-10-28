/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

fixture('Babel')

test('should allow setting targets.browsers', async t => {
  await nextBuild(join(__dirname, '../fixtures/targets-browsers'))
})

test('should allow setting targets to a string', async t => {
  await nextBuild(join(__dirname, '../fixtures/targets-string'))
})
