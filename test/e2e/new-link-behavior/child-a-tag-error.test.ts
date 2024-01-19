import { createNext, FileRef } from 'e2e-utils'
import { getRedboxSource, hasRedbox } from 'next-test-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import path from 'path'

const appDir = path.join(__dirname, 'child-a-tag-error')

describe('New Link Behavior with <a> child', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
        'next.config.js': new FileRef(path.join(appDir, 'next.config.js')),
      },
      dependencies: {
        next: 'latest',
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should throw error with <a> child', async () => {
    const browser = await webdriver(next.url, `/`)
    const link = await browser.elementsByCss('a[href="/about"]')
    const msg =
      'Error: Invalid <Link> with <a> child. Please remove <a> or use <Link legacyBehavior>'

    if ((global as any).isDev) {
      expect(next.cliOutput).toContain(msg)
      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxSource(browser)).toContain(msg)
      expect(link).not.toBeDefined()
    } else {
      expect(link).toBeDefined()
    }
  })
})
