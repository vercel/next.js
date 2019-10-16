/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import fs from 'fs'
const appDir = join(__dirname, '../')

fixture('Profiling Usage').before(async () => {
  await nextBuild(appDir)
})

test('should emit files', async t => {
  await t
    .expect(fs.existsSync(join(appDir, '.next', 'profile-events.json')))
    .eql(true)
})
