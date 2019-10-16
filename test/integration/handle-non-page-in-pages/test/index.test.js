/* global fixture, test */
import 'testcafe'
import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

fixture('Handle non-page in pages when target: serverless')

test('Fails softly with descriptive error', async t => {
  const { stderr } = await nextBuild(appDir, [], { stderr: true })

  await t
    .expect(stderr)
    .match(
      /webpack build failed: found page without a React Component as default export in/
    )
  await t.expect(stderr).match(/pages\/invalid/)
})
