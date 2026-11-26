import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

async function readValues(browser: {
  elementById(id: string): { text(): Promise<string> }
}) {
  const [cached, unrelated] = await Promise.all([
    browser.elementById('cached').text(),
    browser.elementById('unrelated').text(),
  ])
  return { cached, unrelated }
}

// `experimental.durableUseCacheEntries` only applies with Turbopack.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'use-cache-durable-dev',
  () => {
    describe('with durableUseCacheEntries', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          experimental: { useCache: true, durableUseCacheEntries: true },
        },
      })

      it('only invalidates "use cache" entries whose code changed', async () => {
        const browser = await next.browser('/')
        const { cached: initial } = await readValues(browser)
        expect(initial).toMatch(/^cached-v1:/)

        // Editing a module outside of the cached function's subtree keeps the
        // entry.
        await next.patchFile('app/unrelated.tsx', (content) =>
          content.replace('unrelated-v1', 'unrelated-v2')
        )
        await retry(async () => {
          await browser.refresh()
          const { cached, unrelated } = await readValues(browser)
          expect(unrelated).toBe('unrelated-v2')
          expect(cached).toBe(initial)
        })

        // Editing the cached function invalidates the entry.
        await next.patchFile('app/cached.ts', (content) =>
          content.replace('cached-v1', 'cached-v2')
        )
        await retry(async () => {
          await browser.refresh()
          const { cached } = await readValues(browser)
          expect(cached).toMatch(/^cached-v2:/)
        })

        // Reverting the edit restores the code hash, and with it the entry
        // that was cached for it.
        await next.patchFile('app/cached.ts', (content) =>
          content.replace('cached-v2', 'cached-v1')
        )
        await retry(async () => {
          await browser.refresh()
          const { cached } = await readValues(browser)
          expect(cached).toBe(initial)
        })
      })
    })

    describe('without durableUseCacheEntries', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          experimental: { useCache: true },
        },
      })

      it('invalidates "use cache" entries on any server edit', async () => {
        const browser = await next.browser('/')
        const { cached: initial } = await readValues(browser)
        expect(initial).toMatch(/^cached-v1:/)

        await next.patchFile('app/unrelated.tsx', (content) =>
          content.replace('unrelated-v1', 'unrelated-v2')
        )
        await retry(async () => {
          await browser.refresh()
          const { cached, unrelated } = await readValues(browser)
          expect(unrelated).toBe('unrelated-v2')
          expect(cached).toMatch(/^cached-v1:/)
          expect(cached).not.toBe(initial)
        })
      })
    })
  }
)
