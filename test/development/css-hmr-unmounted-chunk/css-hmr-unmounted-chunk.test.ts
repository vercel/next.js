import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// Regression test for https://github.com/vercel/next.js/issues/74749
//
// In Turbopack dev, editing a CSS module whose component had unmounted threw
// `Error: No link element found for chunk .../components_<hash>._.css` as an
// unhandledRejection, and the edit silently failed to apply — you had to reload
// the page manually to pick it up.
//
// Repro shape (see the fixture): a `dynamic(ssr:false)` shell renders one of a
// few `React.lazy` routes that import an overlapping pool of CSS-module
// components, so Turbopack emits per-route MERGED AGGREGATE css chunks
// (`components_<hash>._.css`). Route 1 owns component C4 (which Route 0 does
// not). Navigating into Route 1 and back to Route 0 unmounts C4, and
// `unloadChunk` removes its aggregate's <link> — but the chunk list stays
// subscribed. Editing `C4.module.css` then produced a 'total' chunk update for
// the now-unlinked aggregate; `reloadChunk` found zero <link>s and rejected
// (the 'total' branch of `applyChunkListUpdate` discards the promise, so it
// surfaced as an unhandledRejection). The fix loads the chunk instead, so the
// edit applies.
describe('css-hmr-unmounted-chunk', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
    patchFileDelay: 500,
  })

  if (!isTurbopack || !isNextDev) {
    it('skipped on non-Turbopack or non-dev environments', () => {})
    return
  }

  it('applies a CSS edit for an unmounted route without erroring or needing a manual reload', async () => {
    const browserErrors: string[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        page.on('pageerror', (err) =>
          browserErrors.push(String(err?.message ?? err))
        )
      },
    })

    // Wait for the ssr:false shell + default route (R0) to mount.
    await retry(async () => {
      expect(await browser.elementByCss('#route').text()).toContain('Route 0')
    })

    // Navigate into R1 (mounts it, links its CSS chunks) then back to R0.
    // R1 owns C4, which R0 does not — so leaving R1 unmounts C4 and removes its
    // merged CSS aggregate's <link>.
    await browser.elementByCss('#btn-R1').click()
    await retry(async () => {
      expect(await browser.elementByCss('#route').text()).toContain('Route 1')
    })
    await browser.elementByCss('#btn-R0').click()
    await retry(async () => {
      expect(await browser.elementByCss('#route').text()).toContain('Route 0')
    })

    const cliOutputBefore = next.cliOutput.length

    // Edit a CSS module owned by the now-unmounted R1. This is the edit that
    // threw before the fix.
    const unmountedCssPath = join('components', 'C4.module.css')
    const originalUnmountedCss = await next.readFile(unmountedCssPath)

    // Also edit a CSS module used by the currently-mounted R0 (C0). Waiting for
    // this visible change to hot-apply gives the (buggy) C4 'total' update time
    // to round-trip, and proves HMR is still alive afterwards.
    const mountedCssPath = join('components', 'C0.module.css')
    const originalMountedCss = await next.readFile(mountedCssPath)

    try {
      await next.patchFile(
        unmountedCssPath,
        originalUnmountedCss.replace('color: red', 'color: blue')
      )
      await next.patchFile(
        mountedCssPath,
        originalMountedCss.replace('color: red', 'color: green')
      )

      // The mounted component's edit hot-applies (HMR is processing updates).
      await retry(async () => {
        const color = await browser.eval(
          `window.getComputedStyle(document.getElementById('c0')).color`
        )
        expect(color).toBe('rgb(0, 128, 0)')
      }, 10000)

      // The unmounted-chunk edit must NOT have thrown the unlinked-chunk error.
      const newCliOutput = next.cliOutput.slice(cliOutputBefore)
      expect(newCliOutput).not.toContain('No link element found for chunk')
      expect(browserErrors.join('\n')).not.toContain(
        'No link element found for chunk'
      )

      // The edit is applied (the fix re-links the now-unlinked chunk with the
      // fresh CSS), so revisiting the route shows the updated color — without a
      // manual reload.
      await browser.elementByCss('#btn-R1').click()
      await retry(async () => {
        const color = await browser.eval(
          `window.getComputedStyle(document.getElementById('c4')).color`
        )
        expect(color).toBe('rgb(0, 0, 255)')
      }, 10000)
    } finally {
      await next.patchFile(unmountedCssPath, originalUnmountedCss)
      await next.patchFile(mountedCssPath, originalMountedCss)
    }
  })
})
