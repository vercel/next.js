import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('use-cache-stale-cross-request-join', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (!isNextStart) {
    it('is only relevant for next start', () => {})
    return
  }

  const count = (text: string) => next.cliOutput.split(text).length - 1

  it('regenerates a static page on-demand while a dynamic render holds a pending stale read', async () => {
    const previewModeId = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    ).preview.previewModeId

    // 1. Populate the "use cache" entry.
    const first = await next.fetch('/some-slug')
    expect(first.status).toBe(200)
    await retry(() => expect(count('[cache-handler] set')).toBeGreaterThan(0))
    const setsBefore = count('[cache-handler] set')

    // 2. Mark the entry stale.
    const revalidated = await next.fetch('/revalidate', { method: 'POST' })
    expect(revalidated.status).toBe(200)
    await retry(() =>
      expect(count('[cache-handler] updateTags')).toBeGreaterThan(0)
    )

    // 3. A dynamic render reads the stale entry and becomes the pending
    // cross-request leader while the handler `get` is held.
    const peek = next.fetch('/peek/some-slug')
    await retry(() =>
      expect(count('[cache-handler] get start stale')).toBeGreaterThan(0)
    )

    // 4. An on-demand revalidation of the static page runs during that read.
    const regenerated = await next.fetch('/some-slug', {
      headers: { 'x-prerender-revalidate': previewModeId },
    })
    expect(regenerated.status).toBe(200)
    expect(next.cliOutput).not.toContain('Invalid revalidate configuration')

    // The on-demand revalidation must regenerate the entry instead of reusing
    // the stale one.
    await retry(() =>
      expect(count('[cache-handler] set')).toBeGreaterThan(setsBefore)
    )

    expect((await peek).status).toBe(200)
  })
})
