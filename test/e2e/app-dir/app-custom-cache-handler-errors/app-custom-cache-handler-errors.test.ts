import { nextTestSetup } from 'e2e-utils'
import { hasErrorToast, retry, waitFor, waitForNoRedbox } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('app-custom-cache-handler-errors - get throws', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: { CACHE_HANDLER_THROW_ON: 'get' },
  })

  if (skipped) {
    return
  }

  it('surfaces the cache handler error', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/?input=x')

    if (isNextDev) {
      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "CustomCacheHandler.get failed",
           "environmentLabel": "Prefetch",
           "label": "Runtime Error",
           "source": "app/page.tsx (19:14) @ CachedData
         > 19 |   return <p>{await getCachedData(input)}</p>
              |              ^",
           "stack": [
             "Object.get throwing-cache-handler.js (24:13)",
             "CachedData app/page.tsx (19:14)",
           ],
         }
        `)
      } else {
        // TODO(veil): Webpack renders the cache handler frame as a file://
        // URL, which the redbox matcher flags as unintended.
        await expect(browser).toDisplayRedbox(`
         {
           "description": "CustomCacheHandler.get failed",
           "environmentLabel": "Prefetch",
           "label": "Runtime Error",
           "source": "app/page.tsx (19:14) @ CachedData
         > 19 |   return <p>{await getCachedData(input)}</p>
              |              ^",
           "stack": [
             "<FIXME-file-protocol>",
             "CachedData app/page.tsx (19:14)",
           ],
         }
        `)
      }
    }

    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain(
        '⨯ Error: CustomCacheHandler.get failed'
      )
    })

    // Give a potential unhandled rejection a chance to be reported before
    // asserting its absence.
    await waitFor(1000)

    const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

    const errorBlock = isNextDev
      ? 'Error: CustomCacheHandler.get failed' +
        '\n    at Object.get (throwing-cache-handler.js:24:13)' +
        '\n    at async CachedData (app/page.tsx:19:14)' +
        "\n  17 |   const { input = 'default' } = await searchParams" +
        '\n  18 |' +
        '\n> 19 |   return <p>{await getCachedData(input)}</p>' +
        '\n     |              ^' +
        '\n  20 | }' +
        '\n  21 |' +
        '\n  22 | export default function Page({ {' +
        "\n  digest: '"
      : // In production, the frames below the cache handler frame are bundled
        // code, and are therefore not stable across bundlers and builds.
        'Error: CustomCacheHandler.get failed' +
        '\n    at Object.get (throwing-cache-handler.js:24:13)' +
        '\n    at '

    expect(cliOutput).toContain('⨯ ' + errorBlock)

    if (!isNextDev) {
      expect(cliOutput).toContain("  digest: '")
    }

    // The error must be logged exactly once, as a rendering error, and in
    // particular not additionally as an unhandled rejection.
    expect(cliOutput).not.toContain('unhandledRejection')
    expect(cliOutput.split(errorBlock).length - 1).toBe(1)
  })
})

describe('app-custom-cache-handler-errors - set throws', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: { CACHE_HANDLER_THROW_ON: 'set' },
  })

  if (skipped) {
    return
  }

  it('renders the page successfully', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/?input=x')

    expect(await browser.elementByCss('p').text()).toBe(
      'cached data for input: x'
    )

    if (isNextDev) {
      // A throwing set() is currently completely silent in dev: the cache
      // handler is called and its rejection is swallowed without being logged
      // or reported to the dev overlay.
      await waitForNoRedbox(browser)
      expect(await hasErrorToast(browser)).toBe(false)
      expect(next.cliOutput.slice(outputIndex)).not.toContain(
        'CustomCacheHandler.set failed'
      )
    } else {
      await retry(async () => {
        expect(stripAnsi(next.cliOutput.slice(outputIndex))).toContain(
          'Error: CustomCacheHandler.set failed' +
            '\n    at Object.set (throwing-cache-handler.js:50:13)' +
            '\n    at <unknown> ('
        )
      })
    }
  })
})
