import { createNext, FileRef, isNextDev } from 'e2e-utils'
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

    if (isNextDev) {
      expect(next.cliOutput).toContain(
        'Error: Invalid <Link> with <a> child. Please remove <a> or use <Link legacyBehavior>'
      )
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Invalid <Link> with <a> child. Please remove <a> or use <Link legacyBehavior>.
       Learn more: https://nextjs.org/docs/messages/invalid-new-link-with-extra-anchor",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
      expect(link.length).toBe(0)
    } else {
      expect(link.length).toBeGreaterThan(0)
    }
  })
})
