import { nextTestSetup } from 'e2e-utils'

describe('dynamic-io-dev-warmup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function assertLog(
    logs: Array<{ source: string; message: string }>,
    message: string,
    environment: string
  ) {
    expect(logs.map((l) => l.message)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          new RegExp(`^(?=.*\\b${message}\\b)(?=.*\\b${environment}\\b).*`)
        ),
      ])
    )
  }

  it('logs with Prerender or Server environment depending based on whether the timing of when the log runs relative to this environment boundary', async () => {
    let browser = await next.browser('/')
    let logs = await browser.log()

    assertLog(logs, 'after layout cache read', 'Prerender')
    assertLog(logs, 'after page cache read', 'Prerender')
    assertLog(logs, 'after cached layout fetch', 'Prerender')
    assertLog(logs, 'after cached page fetch', 'Prerender')
    assertLog(logs, 'after uncached layout fetch', 'Server')
    assertLog(logs, 'after uncached page fetch', 'Server')

    // After a revalidation the subsequent warmup render must discard stale
    // cache entries.
    await next.fetch('/revalidate')

    browser = await next.browser('/')
    logs = await browser.log()

    assertLog(logs, 'after layout cache read', 'Prerender')
    assertLog(logs, 'after page cache read', 'Prerender')
    assertLog(logs, 'after cached layout fetch', 'Prerender')
    assertLog(logs, 'after cached page fetch', 'Prerender')
    assertLog(logs, 'after uncached layout fetch', 'Server')
    assertLog(logs, 'after uncached page fetch', 'Server')
  })
})
