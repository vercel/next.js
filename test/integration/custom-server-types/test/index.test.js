/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { buildTS } from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('Custom Server TypeScript')

test('should build server.ts correctly', async t => {
  await buildTS([], appDir)
})
