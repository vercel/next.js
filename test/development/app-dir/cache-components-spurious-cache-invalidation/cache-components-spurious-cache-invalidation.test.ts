import { nextTestSetup, type NextInstance, type Playwright } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

// In dev, `"use cache"` entries must only be discarded when something they
// can depend on changes (their code, or env) — and, conversely, they must
// never survive into a different dev server run, where the code may have
// changed while the server was down.

async function readCachedValue(browser: Playwright) {
  return browser.elementById('cached-value').text()
}

// Right after the dev server starts, it may still be settling (e.g.
// finishing startup compiles), so wait until the cached value is stable
// across reloads before asserting anything about invalidation.
async function waitForStableCachedValue(
  next: NextInstance,
  browser: Playwright
) {
  let stableValue: string = ''
  await retry(async () => {
    await browser.loadPage(next.url + '/')
    const first = await readCachedValue(browser)
    await browser.loadPage(next.url + '/')
    const second = await readCachedValue(browser)
    expect(second).toBe(first)
    stableValue = second
  }, 15_000)
  return stableValue
}

describe('cache-components-spurious-cache-invalidation', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: nodePath.join(__dirname, 'fixtures/default'),
  })

  // Serving the added page requires the file watcher to have processed
  // everything up to and including this addition, plus a compile — so any
  // invalidation that an earlier change could have caused has landed by now,
  // and a negative ("the cached value didn't change") can be asserted right
  // after, instead of waiting out an arbitrary settling period.
  async function addPageAndWaitUntilServable(pathname: string) {
    await next.patchFile(
      `app${pathname}/page.tsx`,
      `export default function Page() { return <p>${pathname}</p> }`
    )
    await retry(async () => {
      expect((await next.fetch(pathname)).status).toBe(200)
    }, 15_000)
  }

  it('keeps use cache entries when an unrelated page is added and removed', async () => {
    const browser = await next.browser('/')
    const stableValue = await waitForStableCachedValue(next, browser)

    try {
      await addPageAndWaitUntilServable('/unrelated')

      await browser.loadPage(next.url + '/')
      expect(await readCachedValue(browser)).toBe(stableValue)
      await browser.loadPage(next.url + '/')
      expect(await readCachedValue(browser)).toBe(stableValue)

      await next.deleteFile('app/unrelated/page.tsx')
      await retry(async () => {
        expect((await next.fetch('/unrelated')).status).toBe(404)
      }, 15_000)

      // Removal doesn't compile anything we could wait for, so push another
      // page addition through as a barrier before asserting.
      await addPageAndWaitUntilServable('/unrelated-barrier')

      await browser.loadPage(next.url + '/')
      expect(await readCachedValue(browser)).toBe(stableValue)
      await browser.loadPage(next.url + '/')
      expect(await readCachedValue(browser)).toBe(stableValue)
    } finally {
      for (const dir of ['app/unrelated', 'app/unrelated-barrier']) {
        if (nodeFs.existsSync(nodePath.join(next.testDir, dir))) {
          await next.deleteFile(`${dir}/page.tsx`)
        }
      }
    }
  })

  // Turbopack-only: on webpack, adding a page recompiles the server bundle
  // (the compiled-in client router filter changes), which replaces the
  // serving module instances, so module state doesn't survive there.
  if (isTurbopack) {
    it('keeps module state when an unrelated page is added', async () => {
      async function readRenderCount() {
        const html = await (await next.fetch('/')).text()
        const match = html.match(/id="render-count">(\d+)</)
        expect(match).not.toBeNull()
        return Number(match![1])
      }

      const first = await readRenderCount()
      const second = await readRenderCount()
      expect(second).toBeGreaterThan(first)

      try {
        await addPageAndWaitUntilServable('/unrelated')
        await waitFor(2000)
        // If the page add re-evaluated the module, the counter restarted
        // from zero.
        expect(await readRenderCount()).toBeGreaterThan(second)
        await waitFor(2000)
        expect(await readRenderCount()).toBeGreaterThan(second)
      } finally {
        if (nodeFs.existsSync(nodePath.join(next.testDir, 'app/unrelated'))) {
          await next.deleteFile('app/unrelated/page.tsx')
        }
      }
    })
  }

  it('discards use cache entries when an env file changes', async () => {
    const browser = await next.browser('/')
    const stableValue = await waitForStableCachedValue(next, browser)

    // The page reads this var, so its output depends on the change.
    await next.patchFile('.env', 'NEXT_PUBLIC_CACHE_BUSTER=busted')

    try {
      await retry(async () => {
        await browser.loadPage(next.url + '/')
        expect(await browser.elementById('env-value').text()).toBe('busted')
        expect(await readCachedValue(browser)).not.toBe(stableValue)
      }, 15_000)
    } finally {
      await next.deleteFile('.env')
    }
  })

  it('refetches server components when an env change does not affect compiled output', async () => {
    const browser = await next.browser('/')
    await waitForStableCachedValue(next, browser)

    await browser.loadPage(next.url + '/')
    expect(await browser.elementById('runtime-env-value').text()).toBe('unset')

    // This var is only read at render time, so the rebuild after the env
    // change is a no-op.
    await next.patchFile('.env', 'RUNTIME_GREETING=hello')

    try {
      await retry(async () => {
        // Deliberately no reload here.
        expect(await browser.elementById('runtime-env-value').text()).toBe(
          'hello'
        )
      }, 15_000)
    } finally {
      await next.deleteFile('.env')
    }
  })
})

describe('cache-components-spurious-cache-invalidation - persistent cache handler', () => {
  const { next } = nextTestSetup({
    files: nodePath.join(__dirname, 'fixtures/persistent-handler'),
  })

  it('discards use cache entries across dev server restarts', async () => {
    const browser = await next.browser('/')
    const stableValue = await waitForStableCachedValue(next, browser)

    await next.stop()

    // The custom cache handler persists entries on disk. Ensure they're
    // actually there — otherwise a fresh value after the restart wouldn't
    // prove anything (it could just mean nothing was persisted).
    const persistedEntries = nodeFs.readdirSync(
      nodePath.join(next.testDir, '.file-system-cache')
    )
    expect(persistedEntries.length).toBeGreaterThan(0)

    await next.start()

    const newBrowser = await next.browser('/')
    const newStableValue = await waitForStableCachedValue(next, newBrowser)
    expect(newStableValue).not.toBe(stableValue)
  })

  it('discards use cache entries when a previous run made the same edit', async () => {
    const browser = await next.browser('/')
    await waitForStableCachedValue(next, browser)

    const originalPage = await next.readFile('app/page.tsx')
    const editedPage = originalPage.replace(
      '<main>',
      '<main><p id="edited-marker">edited</p>'
    )
    expect(editedPage).not.toBe(originalPage)

    async function waitForMarker(b: Playwright, present: boolean) {
      await retry(async () => {
        await b.loadPage(next.url + '/')
        expect(await b.hasElementByCssSelector('#edited-marker')).toBe(present)
      }, 15_000)
    }

    try {
      await next.patchFile('app/page.tsx', editedPage)
      await waitForMarker(browser, true)
      const editedValue = await waitForStableCachedValue(next, browser)

      await next.stop()
      await next.start()

      // Even though the previous run persisted an entry for this exact code,
      // it must not be served: entries never carry over between runs.
      const newBrowser = await next.browser('/')
      await next.patchFile('app/page.tsx', originalPage)
      await waitForMarker(newBrowser, false)
      await next.patchFile('app/page.tsx', editedPage)
      await waitForMarker(newBrowser, true)

      const newEditedValue = await waitForStableCachedValue(next, newBrowser)
      expect(newEditedValue).not.toBe(editedValue)
    } finally {
      await next.patchFile('app/page.tsx', originalPage)
    }
  })
})
