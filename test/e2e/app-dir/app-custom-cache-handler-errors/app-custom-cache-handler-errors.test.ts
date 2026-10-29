import { randomUUID } from 'crypto'
import { nextTestSetup } from 'e2e-utils'
import { hasErrorToast, retry, waitFor, waitForNoRedbox } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import escapeStringRegexp from 'escape-string-regexp'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('app-custom-cache-handler-errors - get throws', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    env: { CACHE_HANDLER_THROW_ON: 'get' },
  })

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

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('app-custom-cache-handler-errors - set throws', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    env: { CACHE_HANDLER_THROW_ON: 'set' },
  })

  it('logs the cache write error without failing the render', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/?input=x')

    expect(await browser.elementByCss('p').text()).toBe(
      'cached data for input: x'
    )

    if (isNextDev) {
      await waitForNoRedbox(browser)
      expect(await hasErrorToast(browser)).toBe(false)
    }

    const errorBlock =
      'Error: CustomCacheHandler.set failed' +
      '\n    at Object.set (throwing-cache-handler.js:50:13)'

    await retry(async () => {
      expect(stripAnsi(next.cliOutput.slice(outputIndex))).toContain(errorBlock)
    })

    const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
    expect(cliOutput).not.toContain('unhandledRejection')
    expect(cliOutput).toIncludeRepeated(escapeStringRegexp(errorBlock), 1)
  })
})

// This suite checks the configured handler without development's in-memory
// front handler. The control route and handler must share a server process.
// @force-gate start
describe('app-custom-cache-handler-errors - lookup recovery', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CACHE_HANDLER_THROW_ON: 'retry-get' },
  })

  it('retries a shared failed lookup and shares its successful fill while the write is pending', async () => {
    const id = randomUUID()
    const outputIndex = next.cliOutput.length
    const control = (action: string) =>
      next.fetch(`/lookup-retry?id=${id}`, { method: 'POST', body: action })
    const readState = () =>
      next.fetch('/lookup-retry?state').then(
        (response) =>
          response.json() as Promise<{
            lookupCount: number
            writeStarted: boolean
            writeCompleted: boolean
            cacheReadsCompleted: boolean
          }>
      )
    await control('fail-lookup-and-hold-write')
    const rendering = next.fetch(`/lookup-retry?id=${id}`)
    try {
      // The retry must resolve before `set()` completes. A lookup count of two
      // also checks that the initial calls shared the rejected `get()`.
      await retry(async () => {
        expect(await readState()).toEqual({
          lookupCount: 2,
          writeStarted: true,
          writeCompleted: false,
          cacheReadsCompleted: true,
        })
      })
      await control('release-write')
      const response = await rendering
      expect(response.status).toBe(200)
      const body = await response.json()
      // Both initial calls must reject even though only one `get()` throws.
      expect(body.failures).toEqual([
        'expected cache lookup failure',
        'expected cache lookup failure',
      ])
      expect(body.first).toEqual(expect.any(Number))
      expect(body.second).toBe(body.first)
      await retry(async () => {
        expect((await readState()).writeCompleted).toBe(true)
      })
      expect(next.cliOutput.slice(outputIndex)).not.toContain(
        'unhandledRejection'
      )
    } finally {
      await control('release-write')
      await rendering
    }
  })
})

// The handler and control route share process-local state. Development's
// in-memory front handler does not exercise the configured write failure.
// @force-gate start
describe('app-custom-cache-handler-errors - shared write failure', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CACHE_HANDLER_THROW_ON: 'shared-write-failure' },
  })

  it("completes a joining server action and its re-render when the producer's cache write fails", async () => {
    const id = randomUUID()
    const control = (action: string) =>
      next.fetch(`/shared-write-control?id=${id}`, {
        method: 'POST',
        body: action,
      })
    const readState = () =>
      next.fetch('/shared-write-control').then(
        (response) =>
          response.json() as Promise<{
            generatedValues: string[]
            writeStarted: boolean
            writeFailed: boolean
            joinerStarted: boolean
            joinerReadCompleted: boolean
          }>
      )
    const browser = await next.browser(`/shared-write-failure?id=${id}`)
    const initialRender = await browser
      .elementById('shared-write-render')
      .text()

    // The held write keeps the producer's fill available for the action to join.
    await control('hold-write')
    const producer = next.render$(`/shared-write-failure/producer?id=${id}`)
    try {
      await retry(async () => {
        expect((await readState()).writeStarted).toBe(true)
      })

      await browser.elementById('join-fill').click()
      await retry(async () => {
        expect((await readState()).joinerStarted).toBe(true)
      })
      await control('release-write')
      const producerPage = await producer
      const value = producerPage('#shared-write-producer').text()

      await retry(async () => {
        expect(
          await browser.elementById('shared-write-result').text()
        ).not.toBe('')
      })
      expect(await browser.elementById('shared-write-result').text()).toBe(
        value
      )

      // The shared read can succeed before the action fails while awaiting
      // writes. The action must also complete the re-render it requests with
      // refresh().
      expect(await browser.elementById('shared-write-render').text()).not.toBe(
        initialRender
      )
      const state = await readState()
      expect(state.generatedValues).toEqual([value])
      expect(state.writeFailed).toBe(true)
      expect(state.joinerReadCompleted).toBe(true)
    } finally {
      await control('release-write')
      await Promise.allSettled([producer])
    }
  })
})
