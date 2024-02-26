import { createNextDescribe } from 'e2e-utils'
import webdriver from 'next-webdriver'
import {
  hasRedbox,
  getRedboxSource,
  getRedboxDescription,
  check,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

createNextDescribe(
  'fetch failures have good stack traces in edge runtime',
  {
    files: __dirname,
    // don't have access to runtime logs on deploy
    skipDeployment: true,
  },
  ({ next, isNextStart, isNextDev }) => {
    it('when awaiting `fetch` using an unknown domain, stack traces are preserved', async () => {
      const browser = await webdriver(next.url, '/api/unknown-domain')

      if (isNextStart) {
        expect(next.cliOutput).toMatch(/at.+\/pages\/api\/unknown-domain.js/)
      } else if (isNextDev) {
        expect(next.cliOutput).toContain('src/fetcher.js')

        expect(await hasRedbox(browser)).toBe(true)
        const source = await getRedboxSource(browser)

        expect(source).toContain('async function anotherFetcher(...args)')
        expect(source).toContain(`fetch(...args)`)

        const description = await getRedboxDescription(browser)
        expect(description).toEqual('TypeError: fetch failed')
      }
    })

    it('when returning `fetch` using an unknown domain, stack traces are preserved', async () => {
      await webdriver(next.url, '/api/unknown-domain-no-await')
      await check(
        () => stripAnsi(next.cliOutput),
        /at.+\/pages\/api\/unknown-domain-no-await.js/
      )
    })
  }
)
