import type { NextInstance, Playwright as NextBrowser } from 'e2e-utils'
import { assertNoConsoleErrors, retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// Helpers shared by the ppr-cdn-mode suites. A partial page is stored as a
// complete document with its holes marked for client rendering. The browser
// hydrates it, then sends one dynamic RSC request (the refresh) to fill the
// holes.

/** A dynamic RSC request, which is what the refresh sends. */
export function isDynamicRSCRequest(request: Playwright.Request): boolean {
  const headers = request.headers()
  return headers['rsc'] === '1' && headers['next-router-prefetch'] === undefined
}

/** A fetch of the `/_full` payload, which `__NEXT_CLIENT_RESUME` sends. */
export function isFullPayloadRequest(request: Playwright.Request): boolean {
  return request.headers()['next-router-segment-prefetch'] === '/_full'
}

export type OpenedPage = {
  browser: NextBrowser
  page: Playwright.Page
  /** Every top-level document request, including hard reloads. */
  documents: string[]
  /** URLs of dynamic RSC requests: the refresh, and later navigations. */
  dynamicRSCRequests: string[]
  /** Pathnames of `/_full` payload fetches. */
  fullPayloadRequests: string[]
}

export type OpenPageOptions = {
  /** A port to load the page through instead of Next.js, e.g. a fake CDN. */
  baseUrl?: number
  beforePageLoad?: (page: Playwright.Page) => void | Promise<void>
  /** Don't wait for `__NEXT_HYDRATED`, e.g. for a page that keeps reloading. */
  waitHydration?: boolean
}

/** Opens a page and records the requests the browser sends for it. */
export async function openPage(
  next: NextInstance,
  url: string,
  { baseUrl, beforePageLoad, waitHydration = true }: OpenPageOptions = {}
): Promise<OpenedPage> {
  const documents: string[] = []
  const dynamicRSCRequests: string[] = []
  const fullPayloadRequests: string[] = []
  let page!: Playwright.Page
  const browser = await next.browser(url, {
    baseUrl,
    waitHydration,
    // Surface uncaught errors as console errors, so that
    // expectNoConsoleErrors fails on them.
    pushErrorAsConsoleLog: true,
    async beforePageLoad(p: Playwright.Page) {
      page = p
      p.on('request', (request) => {
        if (request.isNavigationRequest()) {
          documents.push(request.url())
        } else if (isFullPayloadRequest(request)) {
          fullPayloadRequests.push(new URL(request.url()).pathname)
        } else if (isDynamicRSCRequest(request)) {
          dynamicRSCRequests.push(request.url())
        }
      })
      await beforePageLoad?.(p)
    },
  })
  return { browser, page, documents, dynamicRSCRequests, fullPayloadRequests }
}

/**
 * Like `openPage`, but closes the page when `fn` settles, even if opening it
 * failed. Use it for pages that may reload in a loop, so that the loop doesn't
 * outlive the test.
 */
export async function withPage<T>(
  next: NextInstance,
  url: string,
  options: OpenPageOptions,
  fn: (opened: OpenedPage) => Promise<T>
): Promise<T> {
  let page: Playwright.Page | undefined
  try {
    const opened = await openPage(next, url, {
      ...options,
      async beforePageLoad(p) {
        page = p
        await options.beforePageLoad?.(p)
      },
    })
    return await fn(opened)
  } finally {
    await page?.close().catch(() => {})
  }
}

/** Waits until the page has hydrated: the layout's counter reports it. */
export async function expectHydrated(browser: NextBrowser) {
  await retry(async () => {
    expect(
      await browser.elementById('counter').getAttribute('data-is-hydrated')
    ).toBe('true')
  })
  expect(await browser.eval(() => (window as any).__NEXT_HYDRATED)).toBe(true)
}

/**
 * Asserts that the current page logged no warnings or errors. The browser
 * keeps one page at a time, so call it before opening the next one.
 */
export async function expectNoConsoleErrors(browser: NextBrowser) {
  await assertNoConsoleErrors(browser)
}

/** Clicks the layout's counter `times` times and waits for the new count. */
export async function clickCounter(browser: NextBrowser, times: number) {
  const before = Number(
    (await browser.elementById('counter').text()).replace('Count: ', '')
  )
  for (let i = 0; i < times; i++) {
    await browser.elementById('counter').click()
  }
  await retry(async () => {
    expect(await browser.elementById('counter').text()).toBe(
      `Count: ${before + times}`
    )
  })
}

/**
 * Holds every request that `matches` until `release` is called. Register it
 * in `beforePageLoad` to hold requests the page sends while it loads.
 */
export async function holdRequests(
  page: Playwright.Page,
  matches: (request: Playwright.Request) => boolean
) {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const held: string[] = []
  await page.route('**/*', async (route) => {
    if (!matches(route.request())) {
      await route.fallback()
      return
    }
    held.push(route.request().url())
    await released
    // The page may have closed or navigated away in the meantime.
    await route.fallback().catch(() => {})
  })
  return { held, release }
}

export type DocumentSnapshot = {
  status: number
  headers: Record<string, string>
  body: string
}

// The snapshot keeps the decoded body, so drop the headers that describe the
// encoded one.
const ENCODING_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
])

/** Fetches a document the way a CDN stores it. */
export async function snapshotDocument(
  next: NextInstance,
  url: string,
  init?: RequestInit
): Promise<DocumentSnapshot> {
  const res = await next.fetch(url, init)
  const body = await res.text()
  const headers: Record<string, string> = {}
  res.headers.forEach((value, key) => {
    if (!ENCODING_HEADERS.has(key)) {
      headers[key] = value
    }
  })
  return { status: res.status, headers, body }
}

/**
 * The portable CDN stand-in, which also works against a deployment. It answers
 * document requests for `pathname` with the snapshot, whatever their query
 * string or cookies, and lets every other request through to the server. Call
 * it from `beforePageLoad`.
 */
export async function serveDocumentFromSnapshot(
  page: Playwright.Page,
  pathname: string,
  snapshot: DocumentSnapshot
) {
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      if (route.request().isNavigationRequest()) {
        await route.fulfill({
          status: snapshot.status,
          headers: snapshot.headers,
          body: snapshot.body,
        })
      } else {
        await route.fallback()
      }
    }
  )
}

/** `$RX` marks a pending boundary of the stored shell for client rendering. */
export const CLIENT_RENDER_INSTRUCTION = /\$RX\("B:[0-9a-z]+",""\)/g

/**
 * Asserts that `html` is a complete document that a CDN can store: it closes
 * itself, inlines the static Flight payload, marks its holes for client
 * rendering, and has nothing from a server resume.
 */
export function expectStoredPartialDocument(html: string) {
  expect(html.trimEnd()).toEndWith('</html>')
  expect(html).toContain('self.__next_f.push(')
  expect(html).toMatch(CLIENT_RENDER_INSTRUCTION)
  // The test harness marks where a server resume starts.
  expect(html).not.toContain('<!-- PPR_BOUNDARY_SENTINEL -->')
}

/** Asserts that a response can be stored by a shared cache. */
export function expectCacheableByCdn(
  headers: Headers | Record<string, string>
) {
  const get = (name: string) =>
    headers instanceof Headers ? headers.get(name) : headers[name]
  const cacheControl = get('cache-control') ?? ''
  expect(cacheControl).toContain('s-maxage=')
  expect(cacheControl).not.toContain('private')
  expect(cacheControl).not.toContain('no-store')
  expect(get('x-nextjs-postponed')).toBeFalsy()
}

/** Waits for a hole's dynamic content. */
export async function waitForHole(browser: NextBrowser, id = 'dynamic') {
  await retry(async () => {
    expect(await browser.hasElementByCssSelector(`#${id}`)).toBe(true)
  }, 10_000)
}

/**
 * Counts the boundaries that the stored document's `$RX` instructions switch
 * to client rendering (`<!--$?-->` becomes `<!--$!-->`), as the parser runs
 * them. Read the count with `getClientRenderedBoundaryCount`. Call it from
 * `beforePageLoad`.
 */
export async function countClientRenderedBoundaries(page: Playwright.Page) {
  await page.addInitScript(() => {
    const w = window as any
    w.__clientRenderedBoundaries = 0
    new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.type === 'characterData' &&
          record.target.nodeType === Node.COMMENT_NODE &&
          (record.target as Comment).data === '$!'
        ) {
          w.__clientRenderedBoundaries++
        }
      }
    }).observe(document, { subtree: true, characterData: true })
  })
}

export async function getClientRenderedBoundaryCount(browser: NextBrowser) {
  return browser.eval(() => (window as any).__clientRenderedBoundaries)
}
