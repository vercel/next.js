/* global fixture, test */
import 'testcafe'
import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

fixture('Invalid Page automatic static optimization')

test('Fails softly with descriptive error', async t => {
  const { stderr } = await nextBuild(appDir, [], { stderr: true })

  await t
    .expect(stderr)
    .match(
      /Build optimization failed: found pages without a React Component as default export in/
    )
  await t.expect(stderr).match(/pages\/invalid/)
  await t.expect(stderr).match(/pages\/also-invalid/)
})
