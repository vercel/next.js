/* global fixture, test */
import 'testcafe'

import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

fixture('Handles Errors During Export')

test('Does not crash workers', async t => {
  const { stdout, stderr } = await nextBuild(appDir, [], {
    stdout: true,
    stderr: true
  })

  await t.expect(stdout + stderr).notMatch(/ERR_IPC_CHANNEL_CLOSED/)
})
