import { nextTestSetup } from 'e2e-utils'
import { retry, assertNoConsoleErrors } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

describe('hmr-rsc-cancellation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let pristinePage: string
  let pristineConfig: string

  beforeAll(async () => {
    pristinePage = await next.readFile('app/page.tsx')
    pristineConfig = await next.readFile('next.config.js')
  })

  afterEach(async () => {
    await next.stop()
    // Restore the fixture so each test starts from the same baseline.
    await next.patchFile('app/page.tsx', pristinePage)
    await next.patchFile('next.config.js', pristineConfig)
  })

  // Records each HMR RSC request's aborted/settled state, and a sentinel that
  // is cleared if the page hard-reloads (so we can assert cancellation never
  // triggers a reload).
  async function instrumentBrowser(browser: Playwright) {
    await browser.eval(() => {
      const requests: Array<{ aborted: boolean; settled: boolean }> = []
      ;(window as any).__hmrRequests = requests
      ;(window as any).__reloadSentinel = true
      const originalFetch = window.fetch
      window.fetch = (input: any, init: any) => {
        const headers = new Headers(init?.headers)
        if (headers.get('next-hmr-refresh') === '1') {
          const record = {
            aborted: init?.signal?.aborted ?? false,
            settled: false,
          }
          requests.push(record)
          init?.signal?.addEventListener(
            'abort',
            () => {
              record.aborted = true
            },
            { once: true }
          )
          const result = originalFetch(input, init)
          result.then(
            () => {
              record.settled = true
            },
            () => {
              record.settled = true
            }
          )
          return result
        }
        return originalFetch(input, init)
      }
    })
  }

  function readResult(browser: Playwright) {
    return browser.eval(() => ({
      requests: (window as any).__hmrRequests as Array<{
        aborted: boolean
        settled: boolean
      }>,
      reloaded: (window as any).__reloadSentinel !== true,
    }))
  }

  function expectCleanCliOutput(output: string) {
    expect(output).not.toContain('Failed to fetch RSC payload')
    expect(output).not.toContain('Cannot write to a closing writable stream')
    expect(output).not.toContain('unhandledRejection')
  }

  it('cancels a superseded Server Component HMR request', async () => {
    await next.start()
    const browser = await next.browser('/', { pushErrorAsConsoleLog: true })
    await retry(async () => {
      expect(await browser.elementById('dynamic').text()).toBe('initial')
    })
    await instrumentBrowser(browser)
    const cliStart = next.cliOutput.length

    // Request A: a slow refresh whose dynamic content keeps streaming.
    await next.patchFile('app/page.tsx', (src) =>
      src
        .replace(
          /const dynamicMarker = '[^']*'/,
          "const dynamicMarker = 'slow'"
        )
        .replace(/const dynamicDelayMs = \d+/, 'const dynamicDelayMs = 5000')
    )
    await retry(async () => {
      expect(
        await browser.eval(() => (window as any).__hmrRequests.length)
      ).toBe(1)
    })

    // Request B supersedes A, aborting it.
    await next.patchFile('app/page.tsx', (src) =>
      src
        .replace(
          /const dynamicMarker = '[^']*'/,
          "const dynamicMarker = 'latest'"
        )
        .replace(/const dynamicDelayMs = \d+/, 'const dynamicDelayMs = 0')
    )
    await retry(async () => {
      expect(await browser.elementById('dynamic').text()).toBe('latest')
    })

    await retry(async () => {
      const { requests, reloaded } = await readResult(browser)
      expect(reloaded).toBe(false)
      // Two refreshes: the superseded one was aborted, the newest committed.
      expect(requests).toMatchObject([
        { aborted: true, settled: true },
        { aborted: false, settled: true },
      ])
    })
    await assertNoConsoleErrors(browser)
    expectCleanCliOutput(next.cliOutput.slice(cliStart))
  })

  it('does not surface an error when a partially committed render is superseded', async () => {
    await next.start()
    const browser = await next.browser('/', { pushErrorAsConsoleLog: true })
    await retry(async () => {
      expect(await browser.elementById('dynamic').text()).toBe('initial')
    })
    await instrumentBrowser(browser)
    const cliStart = next.cliOutput.length

    // Request A: remount the Suspense boundary (new key) with a slow dynamic.
    // The remounted boundary has no prior content, so React commits it showing
    // its fallback while the dynamic row streams — the tree is partially
    // committed and on screen.
    await next.patchFile('app/page.tsx', (src) =>
      src
        .replace(/const boundaryKey = '[^']*'/, "const boundaryKey = 'a'")
        .replace(
          /const dynamicMarker = '[^']*'/,
          "const dynamicMarker = 'slow'"
        )
        .replace(/const dynamicDelayMs = \d+/, 'const dynamicDelayMs = 5000')
    )
    await retry(async () => {
      expect(await browser.elementById('dynamic').text()).toBe('loading')
    })

    // Request B supersedes A, keeping the same boundary key so B reuses the
    // committed boundary that is showing A's fallback. A's aborted dynamic row
    // must halt (suspend) rather than reject into that mounted boundary.
    await next.patchFile('app/page.tsx', (src) =>
      src
        .replace(
          /const dynamicMarker = '[^']*'/,
          "const dynamicMarker = 'latest'"
        )
        .replace(/const dynamicDelayMs = \d+/, 'const dynamicDelayMs = 0')
    )
    await retry(async () => {
      expect(await browser.elementById('dynamic').text()).toBe('latest')
    })

    await retry(async () => {
      const { requests, reloaded } = await readResult(browser)
      expect(reloaded).toBe(false)
      // Two refreshes: the superseded one was aborted, the newest committed.
      expect(requests).toMatchObject([
        { aborted: true, settled: true },
        { aborted: false, settled: true },
      ])
    })
    await assertNoConsoleErrors(browser)
    expectCleanCliOutput(next.cliOutput.slice(cliStart))
  })

  it('preserves existing behavior when cancellation is disabled', async () => {
    await next.patchFile('next.config.js', (src) =>
      src.replace(
        'serverComponentsHmrCancellation: true',
        'serverComponentsHmrCancellation: false'
      )
    )
    await next.start()
    const browser = await next.browser('/', { pushErrorAsConsoleLog: true })
    await retry(async () => {
      expect(await browser.elementById('dynamic').text()).toBe('initial')
    })
    await instrumentBrowser(browser)

    await next.patchFile('app/page.tsx', (src) =>
      src
        .replace(
          /const dynamicMarker = '[^']*'/,
          "const dynamicMarker = 'slow'"
        )
        .replace(/const dynamicDelayMs = \d+/, 'const dynamicDelayMs = 1000')
    )
    await retry(async () => {
      expect(
        await browser.eval(() => (window as any).__hmrRequests.length)
      ).toBe(1)
    })

    await next.patchFile('app/page.tsx', (src) =>
      src
        .replace(
          /const dynamicMarker = '[^']*'/,
          "const dynamicMarker = 'latest'"
        )
        .replace(/const dynamicDelayMs = \d+/, 'const dynamicDelayMs = 0')
    )
    await retry(async () => {
      expect(await browser.elementById('dynamic').text()).toBe('latest')
    })

    // With cancellation disabled, neither refresh is aborted; both run to
    // completion like before.
    await retry(async () => {
      const { requests } = await readResult(browser)
      expect(requests).toMatchObject([
        { aborted: false, settled: true },
        { aborted: false, settled: true },
      ])
    })
  })
})
