import { createNext, FileRef, isNextDev } from 'e2e-utils'
import { assertHasRedbox, getRedboxDescription } from 'next-test-utils'
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
      await assertHasRedbox(browser, { pageResponseCode: 500 })
      expect(await getRedboxDescription(browser)).toContain(msg)
      expect(link.length).toBe(0)
    } else {
      expect(link.length).toBeGreaterThan(0)
    }
  })
})
