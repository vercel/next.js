/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

jest.setTimeout(1000 * 60 * 2)

async function uncommentExport(page) {
  const pagePath = join(appDir, 'pages', page)
  const origContent = await fs.readFile(pagePath, 'utf8')
  const newContent = origContent.replace('// export', 'export')
  await fs.writeFile(pagePath, newContent, 'utf8')
  return async () => {
    await fs.writeFile(pagePath, origContent, 'utf8')
  }
}

describe('Page Config', () => {
  it('builds without error when export const config is used outside page', async () => {
    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).not.toMatch(/Failed to compile\./)
  })

  it('shows valid error when page config is a string', async () => {
    const reset = await uncommentExport('invalid/string-config.js')

    try {
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toMatch(
        /https:\/\/err\.sh\/vercel\/next\.js\/invalid-page-config/
      )
    } finally {
      await reset()
    }
  })

  it('shows valid error when page config has no init', async () => {
    const reset = await uncommentExport('invalid/no-init.js')

    try {
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toMatch(
        /https:\/\/err\.sh\/vercel\/next\.js\/invalid-page-config/
      )
    } finally {
      await reset()
    }
  })

  it('shows error when page config has spread properties', async () => {
    const reset = await uncommentExport('invalid/spread-config.js')

    try {
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toMatch(
        /https:\/\/err\.sh\/vercel\/next\.js\/invalid-page-config/
      )
    } finally {
      await reset()
    }
  })

  it('shows error when page config has invalid properties', async () => {
    const reset = await uncommentExport('invalid/invalid-property.js')

    try {
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toMatch(
        /https:\/\/err\.sh\/vercel\/next\.js\/invalid-page-config/
      )
    } finally {
      await reset()
    }
  })

  it('shows error when page config has invalid property value', async () => {
    const reset = await uncommentExport('invalid/invalid-value.js')

    try {
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toMatch(
        /https:\/\/err\.sh\/vercel\/next\.js\/invalid-page-config/
      )
    } finally {
      await reset()
    }
  })

  it('shows error when page config is export from', async () => {
    const reset = await uncommentExport('invalid/export-from.js')

    try {
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toMatch(
        /https:\/\/err\.sh\/vercel\/next\.js\/invalid-page-config/
      )
    } finally {
      await reset()
    }
  })

  it('shows error when page config is imported and exported', async () => {
    const reset = await uncommentExport('invalid/import-export.js')

    try {
      const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
      expect(stderr).toMatch(
        /https:\/\/err\.sh\/vercel\/next\.js\/invalid-page-config/
      )
    } finally {
      await reset()
    }
  })
})
