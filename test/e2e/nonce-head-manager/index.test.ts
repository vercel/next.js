import { FileRef, nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('nonce head manager', () => {
  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'app/pages')),
      public: new FileRef(join(__dirname, 'app/public')),
    },
  })

  async function runTests(url) {
    const browser = await webdriver(next.url, url)
    await check(
      async () =>
        await browser.eval(`JSON.stringify(window.scriptExecutionIds)`),
      '["src-1.js"]'
    )

    await browser.elementByCss('#force-rerender').click()
    await check(
      async () =>
        await browser.eval(`document.getElementById('h1').textContent`),
      'Count 1'
    )
    await check(
      async () =>
        await browser.eval(`JSON.stringify(window.scriptExecutionIds)`),
      '["src-1.js"]'
    )

    await browser.elementByCss('#change-script').click()
    await check(
      async () =>
        await browser.eval(`JSON.stringify(window.scriptExecutionIds)`),
      '["src-1.js","src-2.js"]'
    )

    await browser.elementByCss('#change-script').click()
    await check(
      async () =>
        await browser.eval(`JSON.stringify(window.scriptExecutionIds)`),
      '["src-1.js","src-2.js","src-1.js"]'
    )
  }

  it('should not re-execute the script when re-rendering', async () => {
    await runTests('/')
  })

  it('should not re-execute the script when re-rendering with CSP header', async () => {
    await runTests('/csp')
  })
})
