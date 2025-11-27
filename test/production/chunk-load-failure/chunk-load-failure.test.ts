import { nextTestSetup } from 'e2e-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import path from 'path'
import fs from 'fs'
import { retry } from 'next-test-utils'

describe('chunk-load-failure', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should report async chunk load failures', async () => {
    const chunksPath = path.join(next.testDir, '.next/static/')
    const browserChunks = await recursiveReadDir(chunksPath, {
      pathnameFilter: (f) => /\.js$/.test(f),
    })
    let nextDynamicChunks = browserChunks.filter((f) =>
      fs
        .readFileSync(path.join(chunksPath, f), 'utf8')
        .includes('this is a lazy loaded async component')
    )
    expect(nextDynamicChunks).toHaveLength(1)
    let nextDynamicChunk = nextDynamicChunks[0]

    let pageError: Error | undefined
    const browser = await next.browser('/dynamic', {
      beforePageLoad(page) {
        page.route('**/' + nextDynamicChunk, async (route) => {
          await route.abort('connectionreset')
        })
        page.on('pageerror', (error: Error) => {
          pageError = error
        })
      },
    })

    await retry(async () => {
      const body = await browser.elementByCss('body')
      expect(await body.text()).toMatch(
        /Application error: a client-side exception has occurred while loading/
      )
    })

    expect(pageError).toBeDefined()
    expect(pageError.name).toBe('ChunkLoadError')
    if (process.env.IS_TURBOPACK_TEST) {
      expect(pageError.message).toStartWith(
        'Failed to load chunk /_next/static/' + nextDynamicChunk
      )
    } else {
      expect(pageError.message).toMatch(/^Loading chunk \S+ failed./)
      expect(pageError.message).toContain('/_next/static/' + nextDynamicChunk)
    }
  })
})
