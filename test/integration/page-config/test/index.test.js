/* global fixture, test */
import 'testcafe'

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')
const indexPage = join(appDir, 'pages/index.js')

fixture('Page Config')

test('builds without error when export const config is used outside page', async t => {
  const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
  await t.expect(stderr).notMatch(/Failed to compile\./)
})

test('shows valid error on invalid page config', async t => {
  const origContent = await fs.readFile(indexPage, 'utf8')
  const newContent = origContent.replace('// export', 'export')
  await fs.writeFile(indexPage, newContent, 'utf8')

  try {
    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    await t
      .expect(stderr)
      .match(/https:\/\/err\.sh\/zeit\/next\.js\/invalid-page-config/)
  } finally {
    await fs.writeFile(indexPage, origContent, 'utf8')
  }
})
