import http from 'http'
import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { chromium } from 'playwright'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { findPort, retry } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'

// @force-gate prepareNavigation
describe('router.experimental_prepare', () => {
  // The streaming pages read their data from a test data service, so a test
  // controls when each part of the response streams in. `nextTestSetup` reads
  // `env` when it starts the app, after this hook. A deployment can't reach
  // the service, so it isn't started there.
  const env: Record<string, string> = {}
  // Data requests that haven't been responded to, by key.
  const pendingData = new Map<string, (value: string) => void>()
  let dataServer: ReturnType<typeof createTestDataServer> | null = null
  beforeAll(async () => {
    if (isNextDeploy) {
      return
    }
    dataServer = createTestDataServer((key, response) => {
      pendingData.set(key, response.resolve)
    })
    const port = await findPort()
    dataServer.listen(port)
    env.TEST_DATA_SERVICE_URL = `http://localhost:${port}`
  })
  afterAll(() => {
    dataServer?.close()
  })

  const { next } = nextTestSetup({
    files: __dirname,
    env,
  })

  // The warning is development-only.
  // @force-gate dev
  it('warns when a prepared navigation is committed more than once', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('button[data-prepare="/target"]').click()
    await browser.elementByCss('button[data-commit-push="/target"]').click()
    await browser.waitForElementByCss('#target-dynamic')

    await browser.elementByCss('button[data-commit-push="/target"]').click()
    await retry(async () => {
      const logs = await browser.log()
      expect(logs.map((log) => log.message).join('\n')).toContain(
        'The prepared navigation to "/target" was already committed.'
      )
    })
  })

  // These tests assert on router requests, including prefetches.
  // @force-gate prefetching
  describe('requests', () => {
    async function startBrowser() {
      let page!: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)
      return { browser, act }
    }

    type Browser = Awaited<ReturnType<typeof startBrowser>>['browser']
    type Act = Awaited<ReturnType<typeof startBrowser>>['act']

    async function getPathname(browser: Browser) {
      return new URL(await browser.url()).pathname
    }

    async function getHistoryLength(browser: Browser): Promise<number> {
      return browser.eval('window.history.length')
    }

    async function click(browser: Browser, selector: string) {
      await (await browser.elementByCss(selector)).click()
    }

    // Prefetch the /target route, so the router knows its route tree.
    async function prefetchTarget(browser: Browser, act: Act) {
      await act(
        async () => {
          await click(browser, 'input[data-link-accordion="/target"]')
          await browser.elementByCss('a[href="/target"]')
        },
        { includes: 'Target page' }
      )
      // Hide the link again so it can't trigger more prefetches.
      await click(browser, 'input[data-link-accordion="/target"]')
    }

    async function prepareTarget(browser: Browser, act: Act) {
      await act(() => click(browser, 'button[data-prepare="/target"]'), {
        includes: 'Dynamic content for /target',
      })
    }

    async function expectTargetRendered(browser: Browser) {
      expect(
        await (await browser.waitForElementByCss('#target-dynamic')).text()
      ).toBe('Dynamic content for /target')
      expect(await getPathname(browser)).toBe('/target')
    }

    it('preparing a navigation does not navigate', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      const historyLength = await getHistoryLength(browser)

      await prepareTarget(browser, act)

      expect(await getPathname(browser)).toBe('/')
      expect(await browser.elementById('hub-a').text()).toBe('Hub A')
      expect(await browser.hasElementByCss('#target-shell')).toBe(false)
      expect(await getHistoryLength(browser)).toBe(historyLength)
    })

    it('committing with push reuses the prepared data and preserves the hash', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      const historyLength = await getHistoryLength(browser)
      await act(
        () => click(browser, 'button[data-prepare="/target#target-shell"]'),
        { includes: 'Dynamic content for /target' }
      )

      // The dynamic stale time is 0, so a regular navigation would refetch the
      // page. The commit reuses the prepared data regardless.
      await act(
        () => click(browser, 'button[data-commit-push="/target#target-shell"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
      expect(new URL(await browser.url()).hash).toBe('#target-shell')
      expect(await getHistoryLength(browser)).toBe(historyLength + 1)
    })

    it('committing with replace reuses the prepared data', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      const historyLength = await getHistoryLength(browser)
      await prepareTarget(browser, act)

      await act(
        () => click(browser, 'button[data-commit-replace="/target"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
      expect(await getHistoryLength(browser)).toBe(historyLength)
    })

    it('committing while the prepared request is in flight reuses it', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)

      // Clicking fires pointerdown (prepare) and then click (commit) in the same
      // scope. `act` withholds responses until the scope exits, so the commit
      // happens before the prepared response arrives. If the commit issued its
      // own request, the dynamic content would appear in two responses, which
      // fails the assertion.
      await act(() => click(browser, 'a[data-prepare-link="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('committing while the prepared request is in flight reuses it, for a route that was not prefetched', async () => {
      const { browser, act } = await startBrowser()

      // Same as above, except the router doesn't know the route yet, so
      // nothing is in the BFCache when the commit starts. The commit takes
      // over the prepared request instead.
      await act(() => click(browser, 'a[data-prepare-link="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('a refresh while preparing a route that was not prefetched invalidates the prepared data', async () => {
      const { browser, act } = await startBrowser()

      // The refresh happens before the prepared response arrives.
      await act(
        async () => {
          await click(browser, 'button[data-prepare="/target"]')
          await click(browser, 'button[data-refresh]')
        },
        { includes: 'Hub A' }
      )

      await act(() => click(browser, 'button[data-commit-push="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('committing a navigation to a route that was not prefetched', async () => {
      const { browser, act } = await startBrowser()

      // Without a prefetch, preparing the navigation also discovers the route.
      await prepareTarget(browser, act)
      expect(await getPathname(browser)).toBe('/')

      await act(
        () => click(browser, 'button[data-commit-push="/target"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
    })

    for (const { method, href } of [
      { method: 'push', href: '/static-target' },
      { method: 'replace', href: '/static-target' },
      { method: 'push', href: '/static-target#static-target' },
      { method: 'replace', href: '/static-target#static-target' },
    ]) {
      it(`committing with ${method} reuses a completed preparation of ${href}`, async () => {
        const { browser, act } = await startBrowser()
        const historyLength = await getHistoryLength(browser)

        await act(() => click(browser, `button[data-prepare="${href}"]`), {
          includes: 'Static target page',
        })
        expect(await getPathname(browser)).toBe('/')

        await act(
          () => click(browser, `button[data-commit-${method}="${href}"]`),
          'no-requests'
        )

        expect(await browser.elementById('static-target').text()).toBe(
          'Static target page'
        )
        expect(await browser.eval('location.pathname + location.hash')).toBe(
          href
        )
        expect(await getHistoryLength(browser)).toBe(
          historyLength + (method === 'push' ? 1 : 0)
        )
      })
    }

    it('commits the prepared URL when a sibling route pattern was prefetched', async () => {
      const { browser, act } = await startBrowser()
      await act(
        () => click(browser, 'input[data-link-accordion="/static-param/a"]'),
        { includes: 'Static param a' }
      )
      await click(browser, 'input[data-link-accordion="/static-param/a"]')

      await act(
        () => click(browser, 'button[data-prepare="/static-param/b"]'),
        {
          includes: 'Static param b',
        }
      )
      await act(
        () => click(browser, 'button[data-commit-push="/static-param/b"]'),
        'no-requests'
      )

      expect(await browser.elementById('static-param').text()).toBe(
        'Static param b'
      )
      expect(await getPathname(browser)).toBe('/static-param/b')
    })

    it('reuses a completed preparation while a replacement prefetch is pending', async () => {
      const { browser, act } = await startBrowser()
      await act(() => click(browser, 'button[data-prepare="/static-target"]'), {
        includes: 'Static target page',
      })

      await act(async () => {
        // Hold the prefetch so commit sees a pending route-cache entry.
        await act(
          () => click(browser, 'input[data-link-accordion="/static-target"]'),
          'block'
        )
        await act(
          () => click(browser, 'button[data-commit-push="/static-target"]'),
          'no-requests'
        )
      })

      expect(await browser.elementById('static-target').text()).toBe(
        'Static target page'
      )
      expect(await getPathname(browser)).toBe('/static-target')
    })

    it('a refresh invalidates a completed preparation of a static route', async () => {
      const { browser, act } = await startBrowser()
      await act(() => click(browser, 'button[data-prepare="/static-target"]'), {
        includes: 'Static target page',
      })

      await act(() => click(browser, 'button[data-refresh]'), {
        includes: 'Hub A',
      })
      await act(
        () => click(browser, 'button[data-commit-push="/static-target"]'),
        {
          includes: 'Static target page',
        }
      )

      expect(await browser.elementById('static-target').text()).toBe(
        'Static target page'
      )
      expect(await getPathname(browser)).toBe('/static-target')
    })

    it('a regular navigation does not reuse an expired prepared route', async () => {
      const { browser, act } = await startBrowser()
      await act(() => click(browser, 'button[data-prepare="/static-target"]'), {
        includes: 'Static target page',
      })

      await act(() => click(browser, 'button[data-push="/static-target"]'), {
        includes: 'Static target page',
      })

      expect(await browser.elementById('static-target').text()).toBe(
        'Static target page'
      )
      expect(await getPathname(browser)).toBe('/static-target')
    })

    it('a regular navigation does not reuse prepared data', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      await prepareTarget(browser, act)

      // Only the commit ignores the stale time. A regular navigation to the
      // same route refetches the stale data.
      await act(() => click(browser, 'button[data-push="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('a refresh between prepare and commit invalidates the prepared data', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      await prepareTarget(browser, act)

      await act(() => click(browser, 'button[data-refresh]'), {
        includes: 'Hub A',
      })

      await act(() => click(browser, 'button[data-commit-push="/target"]'), {
        includes: 'Dynamic content for /target',
      })

      await expectTargetRendered(browser)
    })

    it('can commit after navigating elsewhere', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      await prepareTarget(browser, act)

      await act(() => click(browser, 'button[data-push="/hub-b"]'), {
        includes: 'Hub B',
      })
      expect(await browser.elementById('hub-b').text()).toBe('Hub B')

      // The prepared segments are keyed by their own route, not by the page the
      // navigation was prepared from, so they're still reused.
      await act(
        () => click(browser, 'button[data-commit-push="/target"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
    })

    it('a prepared navigation that redirects does not navigate', async () => {
      const { browser, act } = await startBrowser()
      const historyLength = await getHistoryLength(browser)

      // The redirect is followed, so there's no target content to match on;
      // only assert that the request was made.
      await act(() => click(browser, 'button[data-prepare="/redirect-target"]'))

      expect(await getPathname(browser)).toBe('/')
      expect(await browser.elementById('hub-a').text()).toBe('Hub A')
      expect(await getHistoryLength(browser)).toBe(historyLength)
    })

    it('committing a prepared navigation more than once has no effect', async () => {
      const { browser, act } = await startBrowser()
      await prefetchTarget(browser, act)
      const historyLength = await getHistoryLength(browser)
      await prepareTarget(browser, act)

      await act(
        () => click(browser, 'button[data-commit-push="/target"]'),
        'no-requests'
      )
      await expectTargetRendered(browser)
      expect(await getHistoryLength(browser)).toBe(historyLength + 1)

      await act(
        () => click(browser, 'button[data-commit-push="/target"]'),
        'no-requests'
      )
      await act(
        () => click(browser, 'button[data-commit-replace="/target"]'),
        'no-requests'
      )

      await expectTargetRendered(browser)
      expect(await getHistoryLength(browser)).toBe(historyLength + 1)
    })
  })

  // These tests commit while the prepared response is still streaming. `act`
  // withholds whole responses, so they control the timing through the data
  // service instead, and count the requests themselves.
  // @force-gate !deploy
  describe('committing while the prepared response is streaming', () => {
    afterEach(() => {
      // Unblock any render a failed test left waiting.
      for (const [key, resolve] of pendingData) {
        resolve(key)
      }
      pendingData.clear()
    })

    // Forwards requests to the app. The navigation response for `pathname`
    // can be held until `release()` is called, and its connection dropped
    // once the body contains `dropAfter`, as a broken network would.
    async function startProxy(
      pathname: string,
      options: { holdResponse?: boolean; dropAfter?: string }
    ) {
      const app = new URL(next.url)
      let release = () => {}
      const released = options.holdResponse
        ? new Promise<void>((resolve) => {
            release = resolve
          })
        : Promise.resolve()
      const server = http.createServer((req, res) => {
        const isTarget =
          req.headers['rsc'] === '1' &&
          req.headers['next-router-prefetch'] === undefined &&
          new URL(req.url!, app).pathname === pathname
        const upstream = http.request(
          {
            hostname: app.hostname,
            port: app.port,
            path: req.url,
            method: req.method,
            // Uncompressed, so the body can be searched for `dropAfter`.
            headers: { ...req.headers, 'accept-encoding': 'identity' },
          },
          async (upstreamRes) => {
            if (isTarget) {
              await released
            }
            res.writeHead(upstreamRes.statusCode!, upstreamRes.headers)
            let body = ''
            upstreamRes.on('data', (chunk: Buffer) => {
              body += chunk.toString()
              const shouldDrop =
                isTarget &&
                options.dropAfter !== undefined &&
                body.includes(options.dropAfter)
              if (shouldDrop) {
                upstreamRes.destroy()
                res.write(chunk, () => res.socket!.destroy())
              } else {
                res.write(chunk)
              }
            })
            upstreamRes.on('end', () => res.end())
          }
        )
        req.pipe(upstream)
      })
      const port = await findPort()
      await new Promise<void>((resolve) => server.listen(port, resolve))
      return {
        url: `http://localhost:${port}`,
        release: () => release(),
        close() {
          server.closeAllConnections()
          server.close()
        },
      }
    }

    // Waits two frames, which is usually long enough for the click's
    // transition to render and suspend on the response. If it isn't, the shell
    // arrives first and the test can pass without exercising a late-arriving
    // response.
    async function waitForTwoFrames(page: Playwright.Page) {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
      )
    }

    // Prefetches the route with its link, so the router knows the route
    // before the navigation is prepared.
    async function prefetchRoute(page: Playwright.Page, pathname: string) {
      const prefetched = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === pathname &&
          !!response.request().headers()['next-router-prefetch']
      )
      await page.click(`input[data-link-accordion="${pathname}"]`)
      await (await prefetched).finished()
      await page.click(`input[data-link-accordion="${pathname}"]`)
    }

    async function waitForDataRequest(key: string) {
      await retry(() => {
        expect([...pendingData.keys()]).toContain(key)
      })
    }

    function resolveData(key: string, value: string) {
      const resolve = pendingData.get(key)!
      pendingData.delete(key)
      resolve(value)
    }

    // Presses the link, which prepares the navigation, without releasing it.
    // Releasing the mouse clicks the link, which commits the navigation.
    async function pressPrepareLink(page: Playwright.Page, href: string) {
      const box = (await page
        .locator(`a[data-prepare-link="${href}"]`)
        .boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
    }

    async function startBrowser(
      pathname: string,
      options?: { baseUrl?: string }
    ) {
      let page!: Playwright.Page
      const requests: Array<string> = []
      const browser = await next.browser('/', {
        ...options,
        beforePageLoad(p: Playwright.Page) {
          page = p
          p.on('request', (request) => {
            const url = new URL(request.url())
            if (request.headers()['rsc'] === '1' && url.pathname === pathname) {
              requests.push(request.url())
            }
          })
        },
      })
      return { browser, page, requests }
    }

    it('renders the response as it streams, from a single request', async () => {
      const { browser, page, requests } =
        await startBrowser('/streaming-target')

      await pressPrepareLink(page, '/streaming-target')
      // The server is rendering the page's shell, so the response can't have
      // finished.
      await waitForDataRequest('streaming-shell')
      await page.mouse.up()

      resolveData('streaming-shell', 'Streaming target shell')
      expect(
        await (await browser.waitForElementByCss('#streaming-shell')).text()
      ).toBe('Streaming target shell')
      expect(await browser.elementById('streaming-late-fallback').text()).toBe(
        'Loading late section...'
      )
      expect(new URL(await browser.url()).pathname).toBe('/streaming-target')

      await waitForDataRequest('streaming-late')
      resolveData('streaming-late', 'Streaming target late section')
      expect(
        await (await browser.waitForElementByCss('#streaming-late')).text()
      ).toBe('Streaming target late section')
      expect(await browser.hasElementByCss('#streaming-late-fallback')).toBe(
        false
      )
      expect(requests).toHaveLength(1)
    })

    it('does not hold the data of an abandoned preparation from a back/forward navigation', async () => {
      const { browser, page } = await startBrowser('/streaming-target')

      // Visit the route, so the router knows it, then go back.
      await pressPrepareLink(page, '/streaming-target')
      await page.mouse.up()
      await waitForDataRequest('streaming-shell')
      resolveData('streaming-shell', 'Streaming target shell')
      await waitForDataRequest('streaming-late')
      resolveData('streaming-late', 'Streaming target late section')
      await browser.waitForElementByCss('#streaming-late')
      await browser.back()
      await browser.waitForElementByCss('#hub-a')

      // Prepare the navigation again, and release the press off the link,
      // which doesn't commit it. The prepare phase writes BFCache entries that
      // wait on its response.
      await pressPrepareLink(page, '/streaming-target')
      await waitForDataRequest('streaming-shell')
      await page.mouse.move(0, 0)
      await page.mouse.up()
      resolveData('streaming-shell', 'Abandoned preparation shell')

      // The forward navigation reuses those entries. It renders the shell as it
      // streams in, rather than waiting for the abandoned response to end.
      await browser.forward()
      expect(
        await (await browser.waitForElementByCss('#streaming-shell')).text()
      ).toBe('Abandoned preparation shell')
      expect(await browser.elementById('streaming-late-fallback').text()).toBe(
        'Loading late section...'
      )
    })

    // The proxy doesn't forward the development server's WebSocket.
    // @force-gate !dev
    it('surfaces a stream error the same way a regular navigation does', async () => {
      const proxy = await startProxy('/streaming-error', {
        dropAfter: 'Streaming error shell',
      })
      try {
        async function navigate(
          commit: (page: Playwright.Page) => Promise<void>
        ) {
          const { browser, page } = await startBrowser('/streaming-error', {
            baseUrl: proxy.url,
          })
          await commit(page)
          resolveData('error-shell', 'Streaming error shell')
          const error = await (
            await browser.waitForElementByCss('#streaming-error')
          ).text()
          return { error, pathname: new URL(await browser.url()).pathname }
        }

        const regular = await navigate(async (page) => {
          await page.click('button[data-push="/streaming-error"]')
          await waitForDataRequest('error-shell')
        })
        const prepared = await navigate(async (page) => {
          await pressPrepareLink(page, '/streaming-error')
          await waitForDataRequest('error-shell')
          await page.mouse.up()
        })

        expect(prepared).toEqual(regular)
        expect(prepared.pathname).toBe('/streaming-error')
      } finally {
        proxy.close()
      }
    })

    // Chrome reports soft navigations by default from version 151. The
    // harness's Chromium is older, so these tests launch one with the feature
    // enabled. The proxy doesn't forward the development server's WebSocket.
    // @force-gate !dev
    describe('is reported by Chrome as a soft navigation', () => {
      for (const { scenario, pathname, name, isRouteKnown, holdResponse } of [
        {
          // The response's headers have arrived, so the commit usually claims
          // a response with bytes already recorded; the test doesn't establish
          // it.
          scenario: 'with bytes already recorded',
          pathname: '/streaming-target',
          name: 'streaming',
          isRouteKnown: false,
          holdResponse: false,
        },
        {
          // The commit claims the response, and takes over the prepared
          // request, before any bytes arrive.
          scenario: 'before any bytes arrive',
          pathname: '/streaming-target',
          name: 'streaming',
          isRouteKnown: false,
          holdResponse: true,
        },
        {
          // The prepare phase requested the route's dynamic data, and wrote
          // BFCache entries that wait on it.
          scenario: 'with bytes already recorded, for a prefetched route',
          pathname: '/streaming-target',
          name: 'streaming',
          isRouteKnown: true,
          holdResponse: false,
        },
        {
          scenario: 'before any bytes arrive, for a prefetched route',
          pathname: '/streaming-target',
          name: 'streaming',
          isRouteKnown: true,
          holdResponse: true,
        },
      ]) {
        it(`when committed ${scenario}`, async () => {
          const proxy = await startProxy(pathname, { holdResponse })
          const chrome = await chromium.launch({
            headless: !!process.env.HEADLESS,
            // Playwright passes its own `--enable-features`, which a second
            // one would replace.
            args: ['--enable-blink-features=SoftNavigationHeuristics'],
          })
          try {
            const page = await chrome.newPage()
            // Navigation requests, which the commit shares with the prepare
            // phase rather than making its own.
            const requests: Array<string> = []
            page.on('request', (request) => {
              const isNavigationRequest =
                request.headers()['rsc'] === '1' &&
                !request.headers()['next-router-prefetch'] &&
                new URL(request.url()).pathname === pathname
              if (isNavigationRequest) {
                requests.push(request.url())
              }
            })
            page.on('console', (message) => {
              console.log(`Browser ${message.type()}: ${message.text()}`)
            })
            page.on('pageerror', (error) => {
              console.log(`Browser page error: ${error.message}`)
            })
            await page.goto(proxy.url)
            await page.waitForFunction(() => '__NEXT_HYDRATED' in window)

            if (isRouteKnown) {
              await prefetchRoute(page, pathname)
            }
            const responseArrived = page.waitForResponse(
              (response) =>
                new URL(response.url()).pathname === pathname &&
                !response.request().headers()['next-router-prefetch']
            )
            await pressPrepareLink(page, pathname)
            await waitForDataRequest(`${name}-shell`)
            if (!holdResponse) {
              await responseArrived
            }
            await page.mouse.up()
            proxy.release()
            await responseArrived
            await waitForTwoFrames(page)
            resolveData(`${name}-shell`, 'Streaming shell')
            await page.locator('#streaming-shell').waitFor()

            await retry(async () => {
              expect(
                await page.evaluate(() =>
                  performance
                    .getEntriesByType('soft-navigation')
                    .map((entry) => new URL(entry.name).pathname)
                )
              ).toEqual([pathname])
            })
            expect(requests).toHaveLength(1)
          } finally {
            await chrome.close()
            proxy.close()
          }
        })
      }
    })
  })
})
