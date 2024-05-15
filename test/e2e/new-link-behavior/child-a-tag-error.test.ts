import { createNext, FileRef, isNextDev } from 'e2e-utils'
import { getRedboxDescription, hasRedbox } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'
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
        react: '19.0.0-beta-4508873393-20240430',
        'react-dom': '19.0.0-beta-4508873393-20240430',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should throw error with <a> child', async () => {
    const browser = await webdriver(next.url, `/`)
    const link = await browser.elementsByCss('a[href="/about"]')
    const msg =
      'Error: Invalid <Link> with <a> child. Please remove <a> or use <Link legacyBehavior>'

    if (isNextDev) {
      expect(next.cliOutput).toContain(msg)
      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxDescription(browser)).toContain(msg)
      expect(link.length).toBe(0)
    } else {
      expect(link.length).toBeGreaterThan(0)
    }
  })
})
