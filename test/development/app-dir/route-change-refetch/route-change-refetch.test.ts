import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'
import type { Page } from 'playwright'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

// The client decides whether an announcement is about the page it's showing by
// comparing the announced name against its pathname, so the name has to be the
// route ("/zz-added"), not the entrypoint ("/zz-added/page").
function recordRouteAnnouncements(announcements: string[]) {
  return (page: Page) => {
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/_next/hmr')) {
        return
      }
      ws.on('framereceived', (frame) => {
        const payload =
          typeof frame.payload === 'string'
            ? frame.payload
            : frame.payload.toString('utf8')
        let message: { type?: string; data?: unknown[] }
        try {
          message = JSON.parse(payload)
        } catch {
          return
        }
        if (message.type === 'addedPage' || message.type === 'removedPage') {
          announcements.push(`${message.type} ${message.data?.[0]}`)
        }
      })
    })
  }
}

describe('route-change-refetch - App Router', () => {
  const { next } = nextTestSetup({
    files: nodePath.join(__dirname, 'fixtures/app'),
  })

  async function addPageAndWaitUntilServable(pathname: string) {
    await next.patchFile(
      `app${pathname}/page.tsx`,
      `export default function Page() { return <p id="added">${pathname}</p> }`
    )
    await retry(async () => {
      expect((await next.fetch(pathname)).status).toBe(200)
    }, 15_000)
  }

  // Wait for the removal to land. A change that's still propagating when the
  // test ends gets announced during the next test, which makes that test's tab
  // refetch when it never asked for it.
  async function cleanupAddedPage() {
    if (nodeFs.existsSync(nodePath.join(next.testDir, 'app/zz-added'))) {
      await next.deleteFile('app/zz-added/page.tsx')
      await retry(async () => {
        expect((await next.fetch('/zz-added')).status).toBe(404)
      }, 15_000)
    }
  }

  it('announces an added page under its route name, and announces nothing else', async () => {
    const announcements: string[] = []
    const browser = await next.browser('/existing', {
      beforePageLoad: recordRouteAnnouncements(announcements),
    })
    expect(await browser.elementById('existing').text()).toBe('existing')

    try {
      await addPageAndWaitUntilServable('/zz-added')
      await retry(async () => {
        expect(announcements).toEqual(['addedPage /zz-added'])
      }, 15_000)
      // Announcing a route that didn't change makes every tab showing it
      // refetch for nothing.
      await waitFor(1000)
      expect(announcements).toEqual(['addedPage /zz-added'])
    } finally {
      await cleanupAddedPage()
    }
  })

  it('updates a tab showing a 404 when that page is added', async () => {
    // Regression test: a route that sorts after all existing ones used to
    // not be announced.
    const browser = await next.browser('/zz-added')
    expect(await browser.elementByCss('body').text()).toContain(
      'This page could not be found'
    )

    try {
      await addPageAndWaitUntilServable('/zz-added')
      // If the tab reacts to the announcement before the server can serve
      // the page, it gets the 404 again and stays there — a pre-existing
      // bug that's being fixed separately. Editing the page makes the
      // server announce again, now that the page can be served.
      // TODO: Remove these edits (in the tests below too) once that bug is
      // fixed; these tests then cover it directly.
      await next.patchFile(
        'app/zz-added/page.tsx',
        `export default function Page() { return <p id="added" data-rev="2">/zz-added</p> }`
      )
      await retry(async () => {
        expect(await browser.elementById('added').text()).toBe('/zz-added')
      }, 15_000)
    } finally {
      await cleanupAddedPage()
    }
  })

  it('updates a tab showing a page when that page is removed', async () => {
    const announcements: string[] = []
    const browser = await next.browser('/existing', {
      beforePageLoad: recordRouteAnnouncements(announcements),
    })
    expect(await browser.elementById('existing').text()).toBe('existing')

    try {
      await next.renameFile('app/existing/page.tsx', 'app/existing/page.bak')
      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          'This page could not be found'
        )
      }, 15_000)
      expect(announcements).toEqual(['removedPage /existing'])
    } finally {
      if (
        nodeFs.existsSync(nodePath.join(next.testDir, 'app/existing/page.bak'))
      ) {
        await next.renameFile('app/existing/page.bak', 'app/existing/page.tsx')
        await retry(async () => {
          expect((await next.fetch('/existing')).status).toBe(200)
        }, 15_000)
      }
    }
  })

  it('updates a tab showing a page that is renamed', async () => {
    // A rename keeps the number of routes the same, so a diff that only
    // compares how many there are sees no change at all.
    const announcements: string[] = []
    const browser = await next.browser('/renamed-a', {
      beforePageLoad: recordRouteAnnouncements(announcements),
    })
    expect(await browser.elementById('renamed').text()).toBe('renamed')

    try {
      await next.renameFile('app/renamed-a', 'app/renamed-b')
      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          'This page could not be found'
        )
      }, 15_000)
      await retry(async () => {
        expect([...announcements].sort()).toEqual([
          'addedPage /renamed-b',
          'removedPage /renamed-a',
        ])
      }, 15_000)
    } finally {
      if (nodeFs.existsSync(nodePath.join(next.testDir, 'app/renamed-b'))) {
        await next.renameFile('app/renamed-b', 'app/renamed-a')
        await retry(async () => {
          expect((await next.fetch('/renamed-a')).status).toBe(200)
        }, 15_000)
      }
    }
  })

  it('updates a tab showing a 404 when a dynamic route that matches is added', async () => {
    const browser = await next.browser('/docs/abc')
    expect(await browser.elementByCss('body').text()).toContain(
      'This page could not be found'
    )

    try {
      await next.patchFile(
        'app/docs/[slug]/page.tsx',
        `export default async function Page(props: {
          params: Promise<{ slug: string }>
        }) {
          const { slug } = await props.params
          return <p id="added">{slug}</p>
        }`
      )
      await retry(async () => {
        expect((await next.fetch('/docs/abc')).status).toBe(200)
      }, 15_000)
      await next.patchFile(
        'app/docs/[slug]/page.tsx',
        `export default async function Page(props: {
          params: Promise<{ slug: string }>
        }) {
          const { slug } = await props.params
          return <p id="added" data-rev="2">{slug}</p>
        }`
      )
      await retry(async () => {
        expect(await browser.elementById('added').text()).toBe('abc')
      }, 15_000)
    } finally {
      if (nodeFs.existsSync(nodePath.join(next.testDir, 'app/docs'))) {
        await next.deleteFile('app/docs/[slug]/page.tsx')
        await retry(async () => {
          expect((await next.fetch('/docs/abc')).status).toBe(404)
        }, 15_000)
      }
    }
  })

  it('updates a tab showing a 404 when a page in a route group is added', async () => {
    const browser = await next.browser('/grouped')
    expect(await browser.elementByCss('body').text()).toContain(
      'This page could not be found'
    )

    try {
      await next.patchFile(
        'app/(group)/grouped/page.tsx',
        `export default function Page() { return <p id="added">grouped</p> }`
      )
      await retry(async () => {
        expect((await next.fetch('/grouped')).status).toBe(200)
      }, 15_000)
      await next.patchFile(
        'app/(group)/grouped/page.tsx',
        `export default function Page() { return <p id="added" data-rev="2">grouped</p> }`
      )
      await retry(async () => {
        expect(await browser.elementById('added').text()).toBe('grouped')
      }, 15_000)
    } finally {
      if (nodeFs.existsSync(nodePath.join(next.testDir, 'app/(group)'))) {
        await next.deleteFile('app/(group)/grouped/page.tsx')
        await retry(async () => {
          expect((await next.fetch('/grouped')).status).toBe(404)
        }, 15_000)
      }
    }
  })

  it('switches a tab between a dynamic route and a more specific page', async () => {
    const browser = await next.browser('/posts/123')
    expect(await browser.elementById('dynamic').text()).toBe('dynamic 123')

    try {
      // Adding a static page that takes precedence for the URL the tab is
      // showing must switch the tab to it.
      await next.patchFile(
        'app/posts/123/page.tsx',
        `export default function Page() { return <p id="static">static 123</p> }`
      )
      await retry(async () => {
        expect(await (await next.fetch('/posts/123')).text()).toContain(
          'id="static"'
        )
      }, 15_000)
      await next.patchFile(
        'app/posts/123/page.tsx',
        `export default function Page() { return <p id="static" data-rev="2">static 123</p> }`
      )
      await retry(async () => {
        expect(await browser.elementById('static').text()).toBe('static 123')
      }, 15_000)

      // Removing it must switch the tab back to the dynamic route.
      await next.deleteFile('app/posts/123/page.tsx')
      await retry(async () => {
        expect(await browser.elementById('dynamic').text()).toBe('dynamic 123')
      }, 15_000)
    } finally {
      if (nodeFs.existsSync(nodePath.join(next.testDir, 'app/posts/123'))) {
        await next.deleteFile('app/posts/123/page.tsx')
        await retry(async () => {
          const html = await (await next.fetch('/posts/123')).text()
          expect(html).toContain('id="dynamic"')
          expect(html).not.toContain('id="static"')
        }, 15_000)
      }
    }
  })
})

describe('route-change-refetch - App Router refetch count', () => {
  // Its own server: how often a change makes a tab refetch depends on what
  // has been compiled so far, and on tabs other tests leave open.
  const { next } = nextTestSetup({
    files: nodePath.join(__dirname, 'fixtures/app'),
  })

  // A refetch the dev server asked for carries the HMR refresh header, which
  // tells it apart from a navigation or a prefetch.
  async function startCountingRefetches(browser: Playwright) {
    await browser.eval(() => {
      const win = window as any
      win.__refetches = 0
      const originalFetch = win.fetch
      win.fetch = (input: any, init: any) => {
        if (new Headers(init?.headers).get('next-hmr-refresh') === '1') {
          win.__refetches++
        }
        return originalFetch(input, init)
      }
    })
  }

  function countRefetches(browser: Playwright): Promise<number> {
    return browser.eval(() => (window as any).__refetches)
  }

  it('refetches an open tab exactly twice when a page is added', async () => {
    const browser = await next.browser('/counted')
    expect(await browser.elementById('counted').text()).toBe('counted')
    await startCountingRefetches(browser)

    await next.patchFile(
      'app/zz-added/page.tsx',
      `export default function Page() { return <p id="added">/zz-added</p> }`
    )
    await retry(async () => {
      expect((await next.fetch('/zz-added')).status).toBe(200)
    }, 15_000)
    await retry(async () => {
      // TODO: Stop counting a page add as an env change, then it'll be 1.
      expect(await countRefetches(browser)).toBe(2)
    }, 15_000)
    // A later one would mean the change was announced more than once.
    await waitFor(1000)
    expect(await countRefetches(browser)).toBe(2)
  })
})

describe('route-change-refetch - Pages Router', () => {
  const { next } = nextTestSetup({
    files: nodePath.join(__dirname, 'fixtures/pages'),
  })

  async function addPageAndWaitUntilServable(pathname: string) {
    await next.patchFile(
      `pages${pathname}.tsx`,
      `export default function Page() { return <p id="added">${pathname}</p> }`
    )
    await retry(async () => {
      expect((await next.fetch(pathname)).status).toBe(200)
    }, 15_000)
  }

  async function cleanupAddedPage() {
    if (nodeFs.existsSync(nodePath.join(next.testDir, 'pages/zz-added.tsx'))) {
      await next.deleteFile('pages/zz-added.tsx')
      await retry(async () => {
        expect((await next.fetch('/zz-added')).status).toBe(404)
      }, 15_000)
    }
  }

  it('reloads a tab showing a 404 when that page is added', async () => {
    const browser = await next.browser('/zz-added')
    expect(await browser.elementByCss('body').text()).toContain('404')

    try {
      await addPageAndWaitUntilServable('/zz-added')
      await retry(async () => {
        expect(await browser.elementById('added').text()).toBe('/zz-added')
      }, 15_000)
    } finally {
      await cleanupAddedPage()
    }
  })

  it('reloads a tab showing a page when that page is removed', async () => {
    // The client only reloads when the removed page is the one it's showing,
    // which it decides by comparing the route name in the message against
    // its pathname. This also pins the naming.
    const browser = await next.browser('/existing')
    expect(await browser.elementById('existing').text()).toBe('existing')

    try {
      await next.renameFile('pages/existing.tsx', 'pages/existing.bak')
      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain('404')
      }, 15_000)
    } finally {
      if (
        nodeFs.existsSync(nodePath.join(next.testDir, 'pages/existing.bak'))
      ) {
        await next.renameFile('pages/existing.bak', 'pages/existing.tsx')
        await retry(async () => {
          expect((await next.fetch('/existing')).status).toBe(200)
        }, 15_000)
      }
    }
  })

  it('reloads a tab showing a dynamic route when that route is removed', async () => {
    // The client decides whether the removed page is the one it's showing by
    // comparing the route name in the message against its pathname, which
    // for dynamic routes is the pattern ("/posts/[id]"). This pins that the
    // announced name is the pattern too.
    const browser = await next.browser('/posts/123')
    expect(await browser.elementById('dynamic').text()).toBe('dynamic 123')

    try {
      await next.renameFile('pages/posts/[id].tsx', 'pages/posts/id.bak')
      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain('404')
      }, 15_000)
    } finally {
      if (
        nodeFs.existsSync(nodePath.join(next.testDir, 'pages/posts/id.bak'))
      ) {
        await next.renameFile('pages/posts/id.bak', 'pages/posts/[id].tsx')
        await retry(async () => {
          expect((await next.fetch('/posts/123')).status).toBe(200)
        }, 15_000)
      }
    }
  })

  it('refetches the route manifest exactly once when a page is added', async () => {
    const manifestRequests: string[] = []
    const browser = await next.browser('/existing', {
      beforePageLoad(page: any) {
        page.on('request', (request: any) => {
          if (request.url().includes('_devPagesManifest')) {
            manifestRequests.push(request.url())
          }
        })
      },
    })
    expect(await browser.elementById('existing').text()).toBe('existing')
    const baseline = manifestRequests.length

    try {
      await addPageAndWaitUntilServable('/zz-added')
      await retry(async () => {
        expect(manifestRequests.length).toBe(baseline + 1)
      }, 15_000)
    } finally {
      await cleanupAddedPage()
    }
  })
})
