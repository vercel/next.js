import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'

// TODO: Somehow the warning doesn't show up with Turbopack, even though the transform is not enabled.
// TODO: It no longer shows up with Webpack either in tests.
describe.skip('styled-components SWC transform', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'next.config.js': new FileRef(
          join(__dirname, 'styled-components-disabled/next.config.js')
        ),
        pages: new FileRef(join(__dirname, 'styled-components-disabled/pages')),
      },
      dependencies: {
        'styled-components': '6.1.16',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should have hydration mismatch with styled-components transform disabled', async () => {
    let browser
    try {
      // Compile /_error
      browser = await webdriver(next.url, '/404')
      await browser.loadPage(new URL('/', next.url).toString())

      await retry(async () => {
        const logs = await browser.log()
        expect(logs).toEqual(
          expect.arrayContaining([
            {
              message: expect.stringContaining(
                'https://react.dev/link/hydration-mismatch'
              ),
              source: 'error',
            },
          ])
        )
      })
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
