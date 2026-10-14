import fs from 'fs/promises'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import type { Page } from 'playwright'

// Regression test for a Turbopack dev CSS hot-reload bug.
//
// Editing an imported global stylesheet while the route's *initial* page load
// is still in flight loses the update: the browser keeps the pre-edit CSS
// indefinitely, with no Fast Refresh cycle and no full reload, even though the
// dev server already serves the updated CSS chunk. Only a manual reload (or a
// dev-server restart) makes the edit visible. Edits made once the page is idle
// hot-reload normally, and the same sequence under webpack applies the edit —
// so this is a Turbopack HMR subscription race against the first navigation.
//
// To hit the window deterministically the edit is made as soon as the initial
// stylesheet response has been delivered to the browser — i.e. after the page
// has the old CSS, but before the HMR client has subscribed to that chunk. The
// write goes straight to disk instead of through `next.patchFile()`, because
// that helper pads Turbopack edits with a fixed 500ms delay, which is wide
// enough to step over the window under test.
//
// The assertion below encodes the *current, incorrect* behavior: the raced
// edit never reaches the page. When the race is fixed, the page ends up at
// `EDITED_COLOR` without a reload and this test must be updated.

const ORIGINAL_COLOR = 'rgb(1, 2, 3)'
const EDITED_COLOR = 'rgb(9, 9, 9)'
const ADDED_SELECTOR = '.race-added'

describe('css-hmr-initial-load-race', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // @force-gate dev && turbopack
  it('does not apply a global stylesheet edit that races the initial page load', async () => {
    const stylesheet = path.join(next.testDir, 'app', 'globals.css')

    // Compile the route up front so the race under test is the HMR
    // subscription against the initial navigation, not the first compilation.
    await next.fetch('/')

    let edit: Promise<unknown> | undefined

    const browser = await next.browser('/', {
      beforePageLoad(page: Page) {
        page.on('response', (response) => {
          if (edit || !new URL(response.url()).pathname.endsWith('.css')) {
            return
          }
          edit = fs.appendFile(
            stylesheet,
            `\n${ADDED_SELECTOR} {\n  color: ${EDITED_COLOR};\n}\n`,
            { flush: true }
          )
        })
      },
    })

    expect(edit).toBeDefined()
    await edit

    const readColor = () =>
      browser.eval<string>(
        `getComputedStyle(document.querySelector('.race-target')).color`
      )

    // Give HMR plenty of time to deliver the update. It never arrives.
    await waitFor(5000)

    // Current (incorrect) behavior: the raced edit is silently dropped.
    expect(await readColor()).toBe(ORIGINAL_COLOR)

    // The dev server itself is up to date — only the running page is stale.
    const hrefs = await browser.eval<string[]>(
      `Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.getAttribute('href'))`
    )
    expect(hrefs.length).toBeGreaterThan(0)

    const servedCss = (
      await Promise.all(
        hrefs.map(async (href) => (await next.fetch(href)).text())
      )
    ).join('\n')
    expect(servedCss).toContain(ADDED_SELECTOR)

    // A manual reload picks the edit up, matching the reported workaround.
    await browser.refresh()
    expect(await readColor()).toBe(EDITED_COLOR)
  })
})
