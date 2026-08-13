import type * as Playwright from 'playwright'
import type { Server } from 'http'
import { createRouterAct } from 'router-act'
import { findPort } from 'next-test-utils'
import { isNextStart, nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { createExportServer } from '../export/server.mjs'

// The prefetch and the navigation paths encode static export URLs separately:
// prefetching appends the per-segment filename to the route directory, while
// navigation appends `.txt` (or `index.txt`). `trailingSlash` is where the two
// encodings are most likely to drift apart, so this reuses the `export` fixture
// with only the config changed.
describe('segment cache (output: "export", trailingSlash: true)', () => {
  if (!isNextStart) {
    test('build test should not run during dev test run', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: join(__dirname, '../export'),
    overrideFiles: {
      'next.config.js': `module.exports = { output: 'export', trailingSlash: true }\n`,
    },
    skipStart: true,
    disableAutoSkewProtection: true,
  })

  let port: number
  let server: Server

  beforeAll(async () => {
    await next.build()
    port = await findPort()
    server = createExportServer(join(next.testDir, 'out'))
    server.listen(port)
  })

  afterAll(() => {
    server?.close()
  })

  it('basic prefetch with a trailing slash', async () => {
    let act
    const browser = await next.browser('/', {
      baseUrl: port,
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="/target-page"]'
        )
        await checkbox.click()
      },
      {
        includes: 'Target page',
      }
    )

    await act(
      async () => {
        const link = await browser.elementByCss('a[href="/target-page/"]')
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        await browser.elementByCss('a[href="/"]')
      },
      {
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })

  it('prefetch a link with prefetch={true} with a trailing slash', async () => {
    let act
    const fetched: string[] = []
    const browser = await next.browser('/', {
      baseUrl: port,
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
        p.on('response', (response) => {
          const { pathname } = new URL(response.url())
          if (
            response.request().method() === 'GET' &&
            !pathname.startsWith('/_next/static/')
          ) {
            fetched.push(pathname)
          }
        })
      },
    })

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="target-page-eager"]'
        )
        await checkbox.click()
      },
      { includes: 'Target page', kind: 'static' }
    )

    // This pins the exact filename on purpose: it is the one assertion that
    // catches the prefetch and navigation encodings drifting apart under
    // `trailingSlash`, which is the reason this suite exists. The trailing slash
    // is dropped before the filename is appended, so the request goes to the
    // same file as it would without `trailingSlash`.
    expect(fetched).toContain('/target-page/__next.target-page.__PAGE__.txt')
    expect(fetched).not.toContain('/target-page/')

    await act(
      async () => {
        const link = await browser.elementByCss('a[href="/target-page/"]')
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        await browser.elementByCss('a[href="/"]')
      },
      {
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })
})
