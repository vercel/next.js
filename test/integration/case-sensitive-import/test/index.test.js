/* eslint-env jest */

import { File, nextBuild } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 1)
const appDir = join(__dirname, '../')

describe('Build warnings', () => {
  it('should not shown error without modifications', async () => {
    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).not.toContain('optimization has been disabled')
  })

  it("should shown error when importing 'next/Head'", async () => {
    const page = new File(join(appDir, 'pages/about.js'))
    try {
      page.replace('next/head', 'next/Head')
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toContain(
        "Module not found: Error: Can't resolve 'next/Head' in "
      )
    } finally {
      page.restore()
    }
  })

  it('should shown error when importing wrong cased user file', async () => {
    const page = new File(join(appDir, 'pages/about.js'))
    try {
      page.replace('../components/mycomponent', '../components/MyComponent')
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toContain(
        "Module not found: Error: Can't resolve '../components/MyComponent' in "
      )
    } finally {
      page.restore()
    }
  })
})
