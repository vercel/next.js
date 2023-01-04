import { createNextDescribe } from 'e2e-utils'
import fs from 'fs-extra'
import { hasRedbox } from 'next-test-utils'
import path from 'path'

createNextDescribe(
  'repeated-dev-edits',
  {
    files: __dirname,
  },
  ({ next }) => {
    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    it('should not break the hydration ', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('version-1')

      const pagePath = 'pages/index.tsx'
      const pageContent = String(
        await fs.readFile(path.join(__dirname, pagePath))
      )

      await next.patchFile(
        pagePath,
        pageContent.replaceAll('version-1', 'version-2')
      )
      browser.waitForElementByCss('#version-2')
      expect(await browser.elementByCss('p').text()).toBe('version-2')

      // Verify no hydration mismatch:
      expect(await hasRedbox(browser)).toBeFalse()

      await next.patchFile(
        pagePath,
        pageContent.replaceAll('version-1', 'version-3')
      )
      browser.waitForElementByCss('#version-3')
      expect(await browser.elementByCss('p').text()).toBe('version-3')

      // Verify no hydration mismatch:
      expect(await hasRedbox(browser)).toBeFalse()

      browser.refresh()

      // Verify no hydration mismatch:
      expect(await hasRedbox(browser)).toBeFalse()
    })
  }
)
