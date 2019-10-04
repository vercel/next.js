/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')
const indexPage = join(appDir, 'pages/index.js')

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe('Page Config', () => {
  it('builds without error when export const config is used outside page', async () => {
    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).not.toMatch(/Failed to compile\./)

    const clientFileOutput = await fs.readFile(
      join(
        appDir,
        '.next/static/test-page-config',
        'pages/check-client-remove.js'
      ),
      'utf8'
    )
    expect(clientFileOutput).not.toMatch('THIS_VALUE_SHOULD_BE_GONE')
  })

  it('shows valid error on invalid page config', async () => {
    const origContent = await fs.readFile(indexPage, 'utf8')
    const newContent = origContent.replace('// export', 'export')
    await fs.writeFile(indexPage, newContent, 'utf8')

    try {
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toMatch(
        /https:\/\/err\.sh\/zeit\/next\.js\/invalid-page-config/
      )
    } finally {
      await fs.writeFile(indexPage, origContent, 'utf8')
    }
  })
})
