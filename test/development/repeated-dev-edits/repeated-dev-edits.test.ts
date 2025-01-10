import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import { assertNoRedbox } from 'next-test-utils'
import path from 'path'

describe('repeated-dev-edits', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
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
    await browser.waitForElementByCss('#version-2')
    expect(await browser.elementByCss('p').text()).toBe('version-2')

    // Verify no hydration mismatch:
    await assertNoRedbox(browser)

    await next.patchFile(
      pagePath,
      pageContent.replaceAll('version-1', 'version-3')
    )
    await browser.waitForElementByCss('#version-3')
    expect(await browser.elementByCss('p').text()).toBe('version-3')

    // Verify no hydration mismatch:
    await assertNoRedbox(browser)

    await browser.refresh()

    // Verify no hydration mismatch:
    await assertNoRedbox(browser)
  })
})
