import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, fetchViaHTTP } from 'next-test-utils'

// TODO: Somehow the warning doesn't show up with Turbopack, even though the transform is not enabled.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'styled-components SWC transform',
  () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'next.config.js': new FileRef(
            join(__dirname, 'styled-components-disabled/next.config.js')
          ),
          pages: new FileRef(
            join(__dirname, 'styled-components-disabled/pages')
          ),
        },
        dependencies: {
          'styled-components': '5.3.3',
        },
      })
    })
    afterAll(() => next.destroy())

    async function matchLogs$(browser) {
      let foundLog = false

      const browserLogs = await browser.log('browser')

      browserLogs.forEach((log) => {
        if (log.message.includes('Warning: Prop `%s` did not match.')) {
          foundLog = true
        }
      })
      return foundLog
    }
    it('should have hydration mismatch with styled-components transform disabled', async () => {
      let browser
      try {
        browser = await webdriver(next.url, '/')

        // Compile /_error
        await fetchViaHTTP(next.url, '/404')

        await check(async () => {
          await browser.refresh()
          const foundLog = await matchLogs$(browser)
          return foundLog ? 'success' : await browser.log('browser')
        }, 'success')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  }
)
