import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('hmr-refetch-coalescing', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  if (!isTurbopack) {
    it('is a Turbopack-only test', () => {})
    return
  }

  function countHmrRefetches(counter: { count: number }) {
    return {
      beforePageLoad(page: any) {
        page.on('request', (request: any) => {
          if ('next-hmr-refresh' in request.headers()) {
            counter.count++
          }
        })
      },
    }
  }

  it('refetches a page once per edit regardless of how many routes the edit affects', async () => {
    // Build the other routes that import the shared component. Each built
    // route registers a server-side change subscription for its endpoint.
    for (const route of ['/b', '/c', '/d', '/e', '/f']) {
      const res = await next.fetch(route)
      expect(res.status).toBe(200)
    }

    const refetches = { count: 0 }
    const browser = await next.browser('/a', countHmrRefetches(refetches))
    expect(await browser.elementByCss('h1').text()).toBe('a: rev-0')

    await next.patchFile('app/shared/banner.js', (content) =>
      content.replace(/rev-\d+/, 'rev-1')
    )

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('a: rev-1')
    })
    // Let any trailing (redundant) refetches land before counting.
    await waitFor(2000)

    // One edit must result in exactly one refetch of the page, no matter how
    // many route endpoints the edited file is part of. Server-side change
    // events arrive per affected endpoint; without coalescing, this client
    // would refetch once per affected route (6 with this fixture).
    expect(refetches.count).toBe(1)

    // A second edit announces again.
    await next.patchFile('app/shared/banner.js', (content) =>
      content.replace(/rev-\d+/, 'rev-2')
    )

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('a: rev-2')
    })
    await waitFor(2000)

    expect(refetches.count).toBe(2)

    await browser.close()
  })

  it('does not refetch for an edit with a compilation error, and refetches once for the fix', async () => {
    const original = await next.readFile('app/shared/banner.js')

    const refetches = { count: 0 }
    const browser = await next.browser('/a', countHmrRefetches(refetches))
    const initialText = await browser.elementByCss('h1').text()

    await next.patchFile(
      'app/shared/banner.js',
      (content) => content + '\nconst broken = ;\n'
    )
    // The errored update must not be announced; wait long enough that a
    // refetch would have happened.
    await waitFor(2000)
    expect(refetches.count).toBe(0)

    await next.patchFile('app/shared/banner.js', () =>
      original.replace(/rev-\d+/, 'rev-9')
    )

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).not.toBe(initialText)
      expect(await browser.elementByCss('h1').text()).toContain('rev-9')
    })
    await waitFor(2000)

    expect(refetches.count).toBe(1)

    await browser.close()
  })
})
