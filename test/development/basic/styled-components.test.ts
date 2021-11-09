import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('styled-components SWC transform', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        // 'next.config.js': new FileRef(
        //   join(__dirname, 'styled-components/next.config.js')
        // ),
        pages: new FileRef(join(__dirname, 'styled-components/pages')),
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
      console.error({ log })
      if (log.message.includes('Warning: Prop `%s` did not match.')) {
        foundLog = true
      }
    })
    return foundLog
  }
  it('should not have hydration mismatch with styled-components transform enabled', async () => {
    let browser
    try {
      browser = await webdriver(next.appPort, '/')

      // Compile /_error
      await fetchViaHTTP(next.appPort, '/404')

      // Try 4 times to be sure there is no mismatch
      expect(await matchLogs$(browser)).toBe(false)
      await browser.refresh()
      expect(await matchLogs$(browser)).toBe(false)
      await browser.refresh()
      expect(await matchLogs$(browser)).toBe(false)
      await browser.refresh()
      expect(await matchLogs$(browser)).toBe(false)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
