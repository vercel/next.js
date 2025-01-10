import { nextTestSetup } from 'e2e-utils'
import webdriver from 'next-webdriver'
import {
  assertHasRedbox,
  getRedboxSource,
  getRedboxDescription,
  check,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('fetch failures have good stack traces in edge runtime', () => {
  const { next, isNextStart, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    // don't have access to runtime logs on deploy
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('when awaiting `fetch` using an unknown domain, stack traces are preserved', async () => {
    const browser = await webdriver(next.url, '/api/unknown-domain')

    if (isNextStart) {
      expect(next.cliOutput).toMatch(/at.+\/pages\/api\/unknown-domain.js/)
    } else if (isNextDev) {
      // TODO(veil): Apply sourcemap
      expect(next.cliOutput).toContain('\n    at anotherFetcher (')

      await assertHasRedbox(browser)
      const source = await getRedboxSource(browser)

      expect(source).toContain('async function anotherFetcher(...args)')
      expect(source).toContain(`fetch(...args)`)

      const description = await getRedboxDescription(browser)
      expect(description).toEqual('TypeError: fetch failed')
    }
  })

  // TODO: It need to have source maps picked up by node.js
  it.skip('when returning `fetch` using an unknown domain, stack traces are preserved', async () => {
    await webdriver(next.url, '/api/unknown-domain-no-await')

    await check(
      () => stripAnsi(next.cliOutput),
      /at.+\/pages\/api\/unknown-domain-no-await.ts:4/
    )
  })
})
