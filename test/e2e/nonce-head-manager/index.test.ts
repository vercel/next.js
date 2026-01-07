import { createNext, FileRef } from 'e2e-utils'
import { retry } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { NextInstance } from 'e2e-utils'
import { join } from 'path'

describe('nonce head manager', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        public: new FileRef(join(__dirname, 'app/public')),
      },
    })
  })
  afterAll(() => next.destroy())

  async function runTests(url) {
    const browser = await webdriver(next.url, url)
    await retry(
      async () => {
        expect(
          await browser.eval(`JSON.stringify(window.scriptExecutionIds)`)
        ).toBe('["src-1.js"]')
      },
      30000,
      1000
    )

    await browser.elementByCss('#force-rerender').click()
    await retry(
      async () => {
        expect(
          await browser.eval(`document.getElementById('h1').textContent`)
        ).toBe('Count 1')
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(
          await browser.eval(`JSON.stringify(window.scriptExecutionIds)`)
        ).toBe('["src-1.js"]')
      },
      30000,
      1000
    )

    await browser.elementByCss('#change-script').click()
    await retry(
      async () => {
        expect(
          await browser.eval(`JSON.stringify(window.scriptExecutionIds)`)
        ).toBe('["src-1.js","src-2.js"]')
      },
      30000,
      1000
    )

    await browser.elementByCss('#change-script').click()
    await retry(
      async () => {
        expect(
          await browser.eval(`JSON.stringify(window.scriptExecutionIds)`)
        ).toBe('["src-1.js","src-2.js","src-1.js"]')
      },
      30000,
      1000
    )
  }

  it('should not re-execute the script when re-rendering', async () => {
    await runTests('/')
  })

  it('should not re-execute the script when re-rendering with CSP header', async () => {
    await runTests('/csp')
  })
})
