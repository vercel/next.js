import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('Script component with a src shared by multiple components', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // https://github.com/vercel/next.js/issues/63300
  it('should run onLoad and onReady once for every component', async () => {
    const browser = await next.browser('/shared-src')

    await retry(async () => {
      expect(await browser.eval(`window.sharedScriptOnLoadCalls`)).toEqual([
        'a',
        'b',
        'c',
      ])
      // onReady must not run before the shared script has been evaluated
      expect(await browser.eval(`window.sharedScriptOnReadyCalls`)).toEqual([
        { id: 'a', evaluations: 1 },
        { id: 'b', evaluations: 1 },
        { id: 'c', evaluations: 1 },
      ])
    })

    // let any extra call settle before asserting that there was none
    await waitFor(500)
    expect(await browser.eval(`window.sharedScriptOnLoadCalls.length`)).toBe(3)
    expect(await browser.eval(`window.sharedScriptOnReadyCalls.length`)).toBe(3)

    // the shared script is still only requested once
    expect(
      await browser.eval(
        `document.querySelectorAll('script[src="/shared-script.js"]').length`
      )
    ).toBe(1)
  })
})
