import { nextTestSetup } from 'e2e-utils'

describe('cache-components-dev-warmup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function assertLog(
    logs: Array<{ source: string; message: string }>,
    message: string,
    expectedEnvironment: string
  ) {
    // Match logs that contain the message, with any environment.
    const logPattern = new RegExp(
      `^(?=.*\\b${message}\\b)(?=.*\\b(Cache|Prerender|Server)\\b).*`
    )
    const logMessages = logs.map((log) => log.message)
    const messages = logMessages.filter((message) => logPattern.test(message))

    // If there's zero or more than one logs that match, the test is not set up correctly.
    if (messages.length === 0) {
      throw new Error(
        `Found no logs matching '${message}':\n\n${logMessages.map((s, i) => `${i}. ${s}`).join('\n')}}`
      )
    }
    if (messages.length > 1) {
      throw new Error(
        `Found multiple logs matching '${message}':\n\n${messages.map((s, i) => `${i}. ${s}`).join('\n')}`
      )
    }

    // The message should have the expected environment.
    const actualMessageText = messages[0]
    const [, actualEnvironment] = actualMessageText.match(logPattern)!
    expect([actualEnvironment, actualMessageText]).toEqual([
      expectedEnvironment,
      expect.stringContaining(message),
    ])
  }

  describe('logs with Prerender or Server environment depending based on whether the timing of when the log runs relative to this environment boundary', () => {
    it('cached data + cached fetch', async () => {
      const path = '/simple'
      const browser = await next.browser(path)

      const assertLogs = async () => {
        const logs = await browser.log()
        assertLog(logs, 'after cache read - layout', 'Prerender')
        assertLog(logs, 'after cache read - page', 'Prerender')
        assertLog(logs, 'after cached fetch - layout', 'Prerender')
        assertLog(logs, 'after cached fetch - page', 'Prerender')

        assertLog(logs, 'after uncached fetch - layout', 'Server')
        assertLog(logs, 'after uncached fetch - page', 'Server')
      }

      // Initial load.
      await assertLogs()

      // After another load (with warm caches) the logs should be the same.
      await browser.loadPage(next.url + path) // clears old logs
      await assertLogs()

      // After a revalidation the subsequent warmup render must discard stale
      // cache entries.
      // This should not affect the environment labels.
      await next.fetch(`/revalidate?path=${encodeURIComponent(path)}`)

      await browser.loadPage(next.url + path) // clears old logs
      await assertLogs()
    })

    it('cached data + private cache', async () => {
      const path = '/private-cache'
      const browser = await next.browser(path)

      const assertLogs = async () => {
        const logs = await browser.log()
        assertLog(logs, 'after cache read - layout', 'Prerender')
        assertLog(logs, 'after cache read - page', 'Prerender')

        // Private caches are dynamic holes in static prerenders,
        // so they shouldn't resolve in the static stage.
        assertLog(logs, 'after private cache read - page', 'Server') // TODO: 'Runtime Prerender'
        assertLog(logs, 'after private cache read - layout', 'Server') // TODO: 'Runtime Prerender'

        assertLog(logs, 'after uncached fetch - layout', 'Server')
        assertLog(logs, 'after uncached fetch - page', 'Server')
      }

      // Initial load.
      await assertLogs()

      // After another load (with warm caches) the logs should be the same.
      // Note that private caches are not currently persisted outside of the request that uses them.
      await browser.loadPage(next.url + path) // clears old logs
      await assertLogs()

      // After a revalidation the subsequent warmup render must discard stale
      // cache entries.
      // This should not affect the environment labels.
      await next.fetch(`/revalidate?path=${encodeURIComponent(path)}`)

      await browser.loadPage(next.url + path) // clears old logs
      await assertLogs()
    })

    it('cached data + short-lived cached data', async () => {
      const path = '/short-lived-cache'
      const browser = await next.browser(path)

      const assertLogs = async () => {
        const logs = await browser.log()
        assertLog(logs, 'after cache read - layout', 'Prerender')
        assertLog(logs, 'after cache read - page', 'Prerender')

        // Short lived caches are dynamic holes in static prerenders,
        // so they shouldn't resolve in the static stage.
        assertLog(logs, 'after short-lived cache read - page', 'Server')
        assertLog(logs, 'after short-lived cache read - layout', 'Server')

        assertLog(logs, 'after uncached fetch - layout', 'Server')
        assertLog(logs, 'after uncached fetch - page', 'Server')
      }

      // Initial load.
      await assertLogs()

      // After another load (with warm caches) the logs should be the same.
      await browser.loadPage(next.url + path) // clears old logs
      await assertLogs()

      // After a revalidation the subsequent warmup render must discard stale
      // cache entries.
      // This should not affect the environment labels.
      await next.fetch(`/revalidate?path=${encodeURIComponent(path)}`)

      await browser.loadPage(next.url + path) // clears old logs
      await assertLogs()
    })
  })

  it('runtime/dynamic APIs', async () => {
    const path = '/apis/123'
    const browser = await next.browser(path)

    const assertLogs = async () => {
      const logs = await browser.log()
      assertLog(logs, 'after cache read - page', 'Prerender')

      for (const apiName of [
        'cookies',
        'headers',
        // TODO(restart-on-cache-miss): these two are currently broken/flaky,
        // because they're created outside of render and can resolve too early.
        // This will be fixed in a follow-up.
        // 'params',
        // 'searchParams',
        'connection',
      ]) {
        assertLog(logs, `after ${apiName}`, 'Server')
      }
    }

    // Initial load.
    await assertLogs()

    // After another load (with warm caches) the logs should be the same.
    await browser.loadPage(next.url + path) // clears old logs
    await assertLogs()

    // After a revalidation the subsequent warmup render must discard stale
    // cache entries.
    // This should not affect the environment labels.
    await next.fetch(`/revalidate?path=${encodeURIComponent(path)}`)

    await browser.loadPage(next.url + path) // clears old logs
    await assertLogs()
  })
})
