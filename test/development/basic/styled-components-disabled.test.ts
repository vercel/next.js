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
        'next.config.js': new FileRef(
          join(__dirname, 'styled-components-disabled/next.config.js')
        ),
        pages: new FileRef(join(__dirname, 'styled-components-disabled/pages')),
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
      browser = await webdriver(next.appPort, '/')

      // Compile /_error
      await fetchViaHTTP(next.appPort, '/404')

      try {
        // Try 4 times to be sure there is no mismatch
        expect(await matchLogs$(browser)).toBe(false)
        await browser.refresh()
        expect(await matchLogs$(browser)).toBe(false)
        await browser.refresh()
        expect(await matchLogs$(browser)).toBe(false)
        await browser.refresh()
        expect(await matchLogs$(browser)).toBe(false)
        throw new Error('did not find mismatch')
      } catch (err) {
        // Verify that it really has the logs
        expect(await matchLogs$(browser)).toBe(true)
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
