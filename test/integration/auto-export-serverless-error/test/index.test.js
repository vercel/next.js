/* global fixture, test */
import 'testcafe'

import fs from 'fs'
import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

fixture('Auto Export Error Serverless')

test('fails to emit the page', async t => {
  const { stderr } = await nextBuild(appDir, [], {
    stderr: true
  })

  await t
    .expect(
      fs.existsSync(path.join(appDir, '.next/serverless/pages/index.html'))
    )
    .eql(false)
  await t.expect(stderr).contains('ReferenceError')
  await t.expect(stderr).contains('Build error occurred')
})
