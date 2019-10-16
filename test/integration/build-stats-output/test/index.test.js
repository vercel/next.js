/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../react-site')

fixture('Build Stats Output')

test('Shows correct package count in output', async t => {
  const { stdout } = await nextBuild(appDir, undefined, { stdout: true })
  await t.expect(stdout).match(/\/something .*?5/)
})
