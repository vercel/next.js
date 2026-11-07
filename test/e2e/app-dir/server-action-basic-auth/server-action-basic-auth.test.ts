import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import webdriver from 'next-webdriver'

describe('server-action-basic-auth', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should run a server action when the page URL contains basic auth credentials', async () => {
    const url = new URL(next.url)
    url.username = 'admin'
    url.password = 'secret'

    const browser = await webdriver(url.toString(), '/')

    // The browser strips the credentials from `location.href`, but keeps them
    // in the document's base URL, which is what relative fetches resolve
    // against. Without that, this test would pass even without the fix.
    expect(await browser.eval('document.baseURI')).toContain('admin:secret@')

    await browser.elementByCss('#run').click()

    await retry(async () => {
      expect(await browser.elementByCss('#error').text()).toBe('none')
      expect(await browser.elementByCss('#result').text()).toBe('2')
    })
  })
})
