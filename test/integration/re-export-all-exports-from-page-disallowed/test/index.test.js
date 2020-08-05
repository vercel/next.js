/* eslint-env jest */
import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '..')

jest.setTimeout(1000 * 60 * 5)

async function commentExportAll() {
  const pagePath = join(appDir, 'pages', 'contact.js')
  const origContent = await fs.readFile(pagePath, 'utf-8')
  const newContent = origContent.replace('export *', '// export *')
  await fs.writeFile(pagePath, newContent, 'utf-8')

  return async () => {
    await fs.writeFile(pagePath, origContent, 'utf-8')
  }
}

describe('Re-export all exports from page is disallowed', () => {
  it('shows error when a page re-export all exports', async () => {
    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })

    expect(stderr).toMatch(
      /https:\/\/err\.sh\/vercel\/next\.js\/export-all-in-page/
    )
  })

  it('builds without error when no `export * from "..."` is used in pages', async () => {
    const uncomment = await commentExportAll()

    try {
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })

      expect(stderr).not.toMatch(
        /https:\/\/err\.sh\/vercel\/next\.js\/export-all-in-page/
      )
    } finally {
      await uncomment()
    }
  })
})
