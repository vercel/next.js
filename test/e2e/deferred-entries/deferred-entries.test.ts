import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'
import { Response } from 'node-fetch'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

interface LogEntry {
  timestamp: number
  entry: string
}

function parseEntryLog(logPath: string): LogEntry[] {
  if (!fs.existsSync(logPath)) {
    return []
  }
  const content = fs.readFileSync(logPath, 'utf-8')
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [timestamp, ...rest] = line.split(':')
      return { timestamp: parseInt(timestamp, 10), entry: rest.join(':') }
    })
}

function parseCallbackLog(logPath: string): number | null {
  if (!fs.existsSync(logPath)) {
    return null
  }
  const content = fs.readFileSync(logPath, 'utf-8')
  const lines = content.split('\n').filter(Boolean)
  if (lines.length === 0) {
    return null
  }
  const [, timestamp] = lines[0].split(':')
  return parseInt(timestamp, 10)
}

function parseCurrentTimeTimestamp(html: string): number {
  const match = html.match(/id="current-time">(\d+)</)
  if (!match) {
    throw new Error('Could not find current-time timestamp in response HTML')
  }
  return parseInt(match[1], 10)
}

function parseDeferredCallbackTimestamp(html: string): number {
  const match = html.match(
    /id="deferred-callback-timestamp">(?:<!-- -->)?(\d+)/
  )
  if (!match) {
    throw new Error(
      'Could not find deferred callback timestamp in response HTML'
    )
  }
  return parseInt(match[1], 10)
}

async function expectPngResponse(res: Response) {
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('image/png')

  const body = Buffer.from(await res.arrayBuffer())
  expect(body.byteLength).toBeGreaterThan(8)
  expect(
    body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ).toBe(true)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForCallbackTimestampToStabilize(
  callbackLogPath: string,
  stableForMs = 500,
  pollIntervalMs = 100,
  timeoutMs = 5000
): Promise<number> {
  const start = Date.now()
  let lastTimestamp = parseCallbackLog(callbackLogPath)
  if (lastTimestamp === null) {
    throw new Error('Callback timestamp is not available')
  }

  let stableMs = 0

  while (Date.now() - start < timeoutMs) {
    await sleep(pollIntervalMs)
    const currentTimestamp = parseCallbackLog(callbackLogPath)
    if (currentTimestamp === null) {
      throw new Error('Callback timestamp disappeared unexpectedly')
    }

    if (currentTimestamp === lastTimestamp) {
      stableMs += pollIntervalMs
      if (stableMs >= stableForMs) {
        return currentTimestamp
      }
    } else {
      lastTimestamp = currentTimestamp
      stableMs = 0
    }
  }

  throw new Error(
    `Callback timestamp did not stabilize within ${timeoutMs}ms (latest: ${lastTimestamp})`
  )
}

describe('deferred-entries', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
    dependencies: {},
  })

  if (skipped) return

  beforeAll(async () => {
    // Clear log files before starting
    const entryLogPath = path.join(next.testDir, '.entry-log')
    const callbackLogPath = path.join(next.testDir, '.callback-log')
    try {
      fs.writeFileSync(entryLogPath, '')
      fs.writeFileSync(callbackLogPath, '')
    } catch (e) {
      // Ignore
    }

    if (isCacheComponentsEnabled) {
      // Cache Components does not allow route segment runtime configs.
      await next.patchFile('app/edge-runtime/page.tsx', (content) =>
        content.replace(/export const runtime = 'edge'[\r\n]+/, '')
      )
    }

    await next.start()
  })

  afterAll(async () => {
    await next.stop()
  })

  it('should build deferred entry successfully', async () => {
    // Access the deferred page - use retry to handle on-demand compilation timing
    await retry(async () => {
      const deferredRes = await next.fetch('/deferred')
      expect(deferredRes.status).toBe(200)
      expect(await deferredRes.text()).toContain('Deferred Page')
    })
  })

  it('should render timestamp written by onBeforeDeferredEntries in deferred source file', async () => {
    const callbackLogPath = path.join(next.testDir, '.callback-log')

    await retry(async () => {
      const deferredRes = await next.fetch('/deferred')
      expect(deferredRes.status).toBe(200)

      const html = await deferredRes.text()
      const renderedTimestamp = parseDeferredCallbackTimestamp(html)

      const callbackTimestamp = parseCallbackLog(callbackLogPath)
      expect(callbackTimestamp).not.toBeNull()
      expect(renderedTimestamp).toBe(callbackTimestamp)
    })
  })

  it('should build pages router routes when using deferred entries', async () => {
    // Verify pages router page works alongside deferred app router entries
    await retry(async () => {
      const legacyRes = await next.fetch('/legacy')
      expect(legacyRes.status).toBe(200)
      expect(await legacyRes.text()).toContain('Legacy Pages Router Page')
    })
  })

  it('should build pages router getStaticProps routes when using deferred entries', async () => {
    await retry(async () => {
      const staticPropsRes = await next.fetch('/static-props')
      expect(staticPropsRes.status).toBe(200)
      expect(await staticPropsRes.text()).toContain(
        'Pages getStaticProps Primary'
      )
    })

    await retry(async () => {
      const staticPropsSecondaryRes = await next.fetch(
        '/static-props-secondary'
      )
      expect(staticPropsSecondaryRes.status).toBe(200)
      expect(await staticPropsSecondaryRes.text()).toContain(
        'Pages getStaticProps Secondary'
      )
    })
  })

  it('should build pages router dynamic getStaticPaths/getStaticProps route when using deferred entries', async () => {
    await retry(async () => {
      const staticPathsRes = await next.fetch('/static-paths/alpha')
      expect(staticPathsRes.status).toBe(200)
      const html = await staticPathsRes.text()
      expect(html).toMatch(
        /Pages getStaticPaths \+ getStaticProps:\s*(?:<!-- -->)?alpha/
      )
    })
  })

  it('should build pages router getServerSideProps route when using deferred entries', async () => {
    await retry(async () => {
      const serverSideRes = await next.fetch('/server-side-props')
      expect(serverSideRes.status).toBe(200)
      expect(await serverSideRes.text()).toContain('Pages getServerSideProps')
    })
  })

  it('should build pages router route with no data fetching when using deferred entries', async () => {
    await retry(async () => {
      const noDataRes = await next.fetch('/no-data')
      expect(noDataRes.status).toBe(200)
      expect(await noDataRes.text()).toContain('Pages No Data Fetching')
    })
  })

  it('should build pages router dynamic and catch-all routes when using deferred entries', async () => {
    await retry(async () => {
      const dynamicRouteRes = await next.fetch('/pages-dynamic/alpha')
      expect(dynamicRouteRes.status).toBe(200)
      const html = await dynamicRouteRes.text()
      expect(html).toMatch(/Pages Dynamic Route:\s*(?:<!-- -->)?alpha/)
    })

    await retry(async () => {
      const catchAllRouteRes = await next.fetch('/pages-catch-all/alpha/beta')
      expect(catchAllRouteRes.status).toBe(200)
      const html = await catchAllRouteRes.text()
      expect(html).toMatch(/Pages Catch-all Route:\s*(?:<!-- -->)?alpha\/beta/)
    })

    await retry(async () => {
      const optionalCatchAllRootRes = await next.fetch(
        '/pages-optional-catch-all'
      )
      expect(optionalCatchAllRootRes.status).toBe(200)
      const html = await optionalCatchAllRootRes.text()
      expect(html).toMatch(
        /Pages Optional Catch-all Route:\s*(?:<!-- -->)?root/
      )
    })

    await retry(async () => {
      const optionalCatchAllSlugRes = await next.fetch(
        '/pages-optional-catch-all/alpha/beta'
      )
      expect(optionalCatchAllSlugRes.status).toBe(200)
      const html = await optionalCatchAllSlugRes.text()
      expect(html).toMatch(
        /Pages Optional Catch-all Route:\s*(?:<!-- -->)?alpha\/beta/
      )
    })
  })

  it('should build app router dynamic route with generateStaticParams when using deferred entries', async () => {
    await retry(async () => {
      const staticParamsRes = await next.fetch('/static-params/alpha')
      expect(staticParamsRes.status).toBe(200)
      const html = await staticParamsRes.text()
      expect(html).toMatch(/Generated Static Param:\s*(?:<!-- -->)?alpha/)
    })
  })

  it('should build app router route in a route group when using deferred entries', async () => {
    await retry(async () => {
      const groupedRouteRes = await next.fetch('/grouped')
      expect(groupedRouteRes.status).toBe(200)
      expect(await groupedRouteRes.text()).toContain('Grouped App Router Page')
    })
  })

  it('should build app router parallel routes when using deferred entries', async () => {
    await retry(async () => {
      const parallelRouteRes = await next.fetch('/parallel')
      expect(parallelRouteRes.status).toBe(200)

      const html = await parallelRouteRes.text()
      expect(html).toContain('Parallel Route Children Slot')
      expect(html).toContain('Parallel Route Team Slot')
      expect(html).toContain('Parallel Route Analytics Slot')
    })
  })

  it('should build app router dynamic and catch-all routes when using deferred entries', async () => {
    await retry(async () => {
      const dynamicRouteRes = await next.fetch('/app-dynamic/alpha')
      expect(dynamicRouteRes.status).toBe(200)
      const html = await dynamicRouteRes.text()
      expect(html).toMatch(/App Dynamic Segment:\s*(?:<!-- -->)?alpha/)
    })

    await retry(async () => {
      const catchAllRouteRes = await next.fetch('/app-catch-all/alpha/beta')
      expect(catchAllRouteRes.status).toBe(200)
      const html = await catchAllRouteRes.text()
      expect(html).toMatch(/App Catch-all Segment:\s*(?:<!-- -->)?alpha\/beta/)
    })

    await retry(async () => {
      const optionalCatchAllRootRes = await next.fetch(
        '/app-optional-catch-all'
      )
      expect(optionalCatchAllRootRes.status).toBe(200)
      const html = await optionalCatchAllRootRes.text()
      expect(html).toMatch(
        /App Optional Catch-all Segment:\s*(?:<!-- -->)?root/
      )
    })

    await retry(async () => {
      const optionalCatchAllSlugRes = await next.fetch(
        '/app-optional-catch-all/alpha/beta'
      )
      expect(optionalCatchAllSlugRes.status).toBe(200)
      const html = await optionalCatchAllSlugRes.text()
      expect(html).toMatch(
        /App Optional Catch-all Segment:\s*(?:<!-- -->)?alpha\/beta/
      )
    })
  })

  it('should build app router route handler when using deferred entries', async () => {
    const callbackLogPath = path.join(next.testDir, '.callback-log')
    await retry(async () => {
      const routeHandlerRes = await next.fetch('/route-handler')
      expect(routeHandlerRes.status).toBe(200)
      const data = await routeHandlerRes.json()
      expect(data.message).toBe('Hello from app route handler')
      const callbackTimestamp = parseCallbackLog(callbackLogPath)
      expect(callbackTimestamp).not.toBeNull()
      expect(data.callbackTimestamp).toBe(callbackTimestamp)
    })
  })

  it('should build app router metadata routes when using deferred entries', async () => {
    await retry(async () => {
      const [
        faviconRes,
        manifestRes,
        robotsRes,
        sitemapRes,
        openGraphRes,
        twitterRes,
        appleIconRes,
      ] = await Promise.all([
        next.fetch('/favicon.ico'),
        next.fetch('/manifest.json'),
        next.fetch('/robots.txt'),
        next.fetch('/sitemap.xml'),
        next.fetch('/opengraph-image'),
        next.fetch('/twitter-image'),
        next.fetch('/apple-icon'),
      ])

      expect(faviconRes.status).toBe(200)
      expect(manifestRes.status).toBe(200)
      expect(robotsRes.status).toBe(200)
      expect(sitemapRes.status).toBe(200)

      const [actualFavicon, actualManifest, actualRobots] = await Promise.all([
        next.readFileBuffer('app/favicon.ico'),
        next.readFile('app/manifest.json'),
        next.readFile('app/robots.txt'),
      ])

      expect(
        Buffer.compare(
          Buffer.from(await faviconRes.arrayBuffer()),
          actualFavicon
        )
      ).toBe(0)
      expect(await manifestRes.text()).toBe(actualManifest)
      expect(await robotsRes.text()).toBe(actualRobots)

      const sitemapXml = await sitemapRes.text()
      expect(sitemapXml).toContain('<urlset')
      expect(sitemapXml).toContain(
        '<loc>https://example.com/deferred-entries</loc>'
      )

      expect(manifestRes.headers.get('content-type')).toMatch(
        /application\/(manifest\+)?json/
      )
      expect(robotsRes.headers.get('content-type')).toContain('text/plain')
      expect(sitemapRes.headers.get('content-type')).toMatch(/xml/)

      await expectPngResponse(openGraphRes)
      await expectPngResponse(twitterRes)
      await expectPngResponse(appleIconRes)
    })
  })

  it('should render app router current time on every request', async () => {
    await retry(async () => {
      const firstRes = await next.fetch('/current-time?request=1')
      expect(firstRes.status).toBe(200)
      const firstTimestamp = parseCurrentTimeTimestamp(await firstRes.text())

      const secondRes = await next.fetch('/current-time?request=2')
      expect(secondRes.status).toBe(200)
      const secondTimestamp = parseCurrentTimeTimestamp(await secondRes.text())

      expect(secondTimestamp).not.toBe(firstTimestamp)
    })
  })

  it('should build pages router API routes when using deferred entries', async () => {
    // Verify pages router API route works alongside deferred app router entries
    await retry(async () => {
      const apiRes = await next.fetch('/api/hello')
      expect(apiRes.status).toBe(200)
      const data = await apiRes.json()
      expect(data.message).toBe('Hello from pages API route')
    })
  })

  it('should build pages router dynamic API routes when using deferred entries', async () => {
    await retry(async () => {
      const dynamicApiRes = await next.fetch('/api/dynamic/alpha')
      expect(dynamicApiRes.status).toBe(200)
      const data = await dynamicApiRes.json()
      expect(data.slug).toBe('alpha')
    })
  })

  it('should run middleware for app router, pages router, and API routes', async () => {
    const routes = ['/deferred', '/legacy', '/api/hello', '/route-handler']

    for (const route of routes) {
      await retry(async () => {
        const res = await next.fetch(route)
        expect(res.status).toBe(200)
        expect(res.headers.get('x-deferred-entries-middleware')).toBe('true')
        expect(res.headers.get('x-deferred-entries-middleware-path')).toBe(
          route
        )
      })
    }
  })

  it('should run instrumentation hooks with deferred entries', async () => {
    await retry(async () => {
      const homeRes = await next.fetch('/')
      expect(homeRes.status).toBe(200)
    })

    await retry(async () => {
      expect(next.cliOutput).toContain(
        '[TEST] deferred-entries instrumentation register (nodejs)'
      )
    })

    await retry(async () => {
      const edgeRes = await next.fetch('/edge-runtime')
      expect(edgeRes.status).toBe(200)
      expect(await edgeRes.text()).toContain('Edge Runtime App Router Page')
    })

    if (!isCacheComponentsEnabled) {
      await retry(async () => {
        expect(next.cliOutput).toContain(
          '[TEST] deferred-entries instrumentation register (edge)'
        )
      })
    }
  })

  it('should call onBeforeDeferredEntries before building deferred entry', async () => {
    // Verify the callback was executed
    const callbackLogPath = path.join(next.testDir, '.callback-log')
    await retry(async () => {
      const callbackTimestamp = parseCallbackLog(callbackLogPath)
      expect(callbackTimestamp).not.toBeNull()
    })
  })

  if (!isNextStart) {
    it('should call onBeforeDeferredEntries during HMR even when non-deferred entry changes', async () => {
      const callbackLogPath = path.join(next.testDir, '.callback-log')

      // First, access the deferred page to trigger the initial callback
      await retry(async () => {
        const deferredRes = await next.fetch('/deferred')
        expect(deferredRes.status).toBe(200)
      })

      // Access the home page so it gets added to tracked entries for HMR
      await retry(async () => {
        const homeRes = await next.fetch('/')
        expect(homeRes.status).toBe(200)
      })

      // Get the initial callback timestamp (should now be set)
      let initialTimestamp: number | null = null
      await retry(async () => {
        initialTimestamp = parseCallbackLog(callbackLogPath)
        expect(initialTimestamp).not.toBeNull()
      })

      // Wait a bit to ensure timestamps will be different
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Modify the home page (non-deferred entry) to trigger HMR
      await next.patchFile('app/page.tsx', (content) =>
        content.replace('Home Page', 'Home Page Updated')
      )

      // Wait for HMR to complete and callback to be called again
      await retry(async () => {
        const newTimestamp = parseCallbackLog(callbackLogPath)
        expect(newTimestamp).not.toBeNull()
        // The callback should have been called again with a newer timestamp
        expect(newTimestamp).toBeGreaterThan(initialTimestamp!)
      })

      // Verify the home page was updated
      await retry(async () => {
        const homeRes = await next.fetch('/')
        expect(homeRes.status).toBe(200)
        expect(await homeRes.text()).toContain('Home Page Updated')
      })
    })

    it('should update deferred rendered timestamp during HMR when non-deferred entry changes', async () => {
      const callbackLogPath = path.join(next.testDir, '.callback-log')

      let initialCallbackTimestamp: number | null = null
      let initialRenderedTimestamp: number | null = null

      // Capture initial callback/rendered timestamp pair from deferred route.
      await retry(async () => {
        const deferredRes = await next.fetch('/deferred')
        expect(deferredRes.status).toBe(200)

        const html = await deferredRes.text()
        initialRenderedTimestamp = parseDeferredCallbackTimestamp(html)
        initialCallbackTimestamp = parseCallbackLog(callbackLogPath)

        expect(initialCallbackTimestamp).not.toBeNull()
        expect(initialRenderedTimestamp).toBe(initialCallbackTimestamp)
      })

      // Ensure callback timestamp changes after a non-deferred edit.
      await new Promise((resolve) => setTimeout(resolve, 100))
      await next.patchFile('app/page.tsx', (content) =>
        content.includes('Home Page Updated')
          ? content.replace('Home Page Updated', 'Home Page Updated Again')
          : content.replace('Home Page', 'Home Page Updated Again')
      )

      let updatedCallbackTimestamp: number | null = null
      await retry(async () => {
        updatedCallbackTimestamp = parseCallbackLog(callbackLogPath)
        expect(updatedCallbackTimestamp).not.toBeNull()
        expect(updatedCallbackTimestamp).toBeGreaterThan(
          initialCallbackTimestamp!
        )
      })

      // Deferred page should now render the new callback-written timestamp.
      await retry(async () => {
        const deferredRes = await next.fetch('/deferred')
        expect(deferredRes.status).toBe(200)

        const html = await deferredRes.text()
        const updatedRenderedTimestamp = parseDeferredCallbackTimestamp(html)
        const latestCallbackTimestamp = parseCallbackLog(callbackLogPath)

        expect(latestCallbackTimestamp).not.toBeNull()
        expect(updatedRenderedTimestamp).toBeGreaterThanOrEqual(
          updatedCallbackTimestamp!
        )
        expect(updatedRenderedTimestamp).toBeLessThanOrEqual(
          latestCallbackTimestamp!
        )
        expect(updatedRenderedTimestamp).toBeGreaterThan(
          initialRenderedTimestamp!
        )
      })
    })

    it('should handle successive non-deferred edits without callback looping', async () => {
      const callbackLogPath = path.join(next.testDir, '.callback-log')

      // Track app/page.tsx with an initial request.
      await retry(async () => {
        const homeRes = await next.fetch('/')
        expect(homeRes.status).toBe(200)
      })

      let previousCallbackTimestamp: number | null = null
      let previousRenderedTimestamp: number | null = null

      await retry(async () => {
        const deferredRes = await next.fetch('/deferred')
        expect(deferredRes.status).toBe(200)

        previousRenderedTimestamp = parseDeferredCallbackTimestamp(
          await deferredRes.text()
        )
        previousCallbackTimestamp = parseCallbackLog(callbackLogPath)
        expect(previousCallbackTimestamp).not.toBeNull()
        expect(previousRenderedTimestamp).toBe(previousCallbackTimestamp)
      })

      const labels = ['Home Page HMR A', 'Home Page HMR B']

      for (const label of labels) {
        if (
          previousCallbackTimestamp === null ||
          previousRenderedTimestamp === null
        ) {
          throw new Error('Previous callback/rendered timestamp is missing')
        }

        const previousCallbackTimestampForIteration = previousCallbackTimestamp
        const previousRenderedTimestampForIteration = previousRenderedTimestamp

        await sleep(100)
        await next.patchFile('app/page.tsx', (content) =>
          content.replace(/Home Page[^<]*/, label)
        )

        let callbackAfterEdit: number | null = null
        await retry(async () => {
          callbackAfterEdit = parseCallbackLog(callbackLogPath)
          expect(callbackAfterEdit).not.toBeNull()
          expect(callbackAfterEdit).toBeGreaterThan(
            previousCallbackTimestampForIteration
          )
        })

        let renderedAfterEdit: number | null = null
        await retry(async () => {
          const deferredRes = await next.fetch('/deferred')
          expect(deferredRes.status).toBe(200)

          renderedAfterEdit = parseDeferredCallbackTimestamp(
            await deferredRes.text()
          )
          const latestCallbackTimestamp = parseCallbackLog(callbackLogPath)
          expect(latestCallbackTimestamp).not.toBeNull()

          expect(renderedAfterEdit).toBeGreaterThanOrEqual(callbackAfterEdit!)
          expect(renderedAfterEdit).toBeLessThanOrEqual(
            latestCallbackTimestamp!
          )
          expect(renderedAfterEdit).toBeGreaterThan(
            previousRenderedTimestampForIteration
          )
        })

        // No runaway callback loop: timestamp should settle when idle.
        const stabilizedTimestamp =
          await waitForCallbackTimestampToStabilize(callbackLogPath)
        expect(stabilizedTimestamp).toBeGreaterThanOrEqual(renderedAfterEdit!)

        previousCallbackTimestamp = callbackAfterEdit
        previousRenderedTimestamp = renderedAfterEdit
      }
    })
  }

  if (isNextStart) {
    it('should call onBeforeDeferredEntries before processing deferred entries during build', async () => {
      const entryLogPath = path.join(next.testDir, '.entry-log')
      const callbackLogPath = path.join(next.testDir, '.callback-log')

      // Parse the logs
      const entryLog = parseEntryLog(entryLogPath)
      const callbackTimestamp = parseCallbackLog(callbackLogPath)

      // Debug output
      console.log('Entry log:', entryLog)
      console.log('Callback timestamp:', callbackTimestamp)

      // Verify the callback was executed
      expect(callbackTimestamp).not.toBeNull()

      // Find the CALLBACK_EXECUTED marker in the entry log
      // The callback runs in finishMake hook before the build phase starts
      const callbackIndex = entryLog.findIndex(
        (e) => e.entry === 'CALLBACK_EXECUTED'
      )
      expect(callbackIndex).toBeGreaterThan(-1)

      // The loader runs during the build phase (after finishMake completes)
      // So CALLBACK_EXECUTED should appear before loader entries
      // Find loader entries (entries that are file paths, not CALLBACK_EXECUTED)
      const loaderEntries = entryLog.filter(
        (e) => e.entry !== 'CALLBACK_EXECUTED'
      )

      // Verify we have loader entries for both home page and deferred page
      const homePageEntries = loaderEntries.filter(
        (e) => e.entry.includes('page.tsx') && !e.entry.includes('deferred')
      )
      const deferredPageEntries = loaderEntries.filter((e) =>
        e.entry.includes('deferred')
      )

      console.log('Home page entries:', homePageEntries)
      console.log('Deferred page entries:', deferredPageEntries)

      expect(homePageEntries.length).toBeGreaterThan(0)
      expect(deferredPageEntries.length).toBeGreaterThan(0)

      // Verify the callback is called after at least one non-deferred entry from
      // the first build pass. Additional non-deferred recompiles may happen in
      // the second pass when metadata routes are included.
      const homePageEntriesBeforeCallback = homePageEntries.filter(
        (e) => e.timestamp <= callbackTimestamp
      )
      expect(homePageEntriesBeforeCallback.length).toBeGreaterThan(0)
      const latestNonDeferredTimestamp = Math.max(
        ...homePageEntriesBeforeCallback.map((e) => e.timestamp)
      )
      expect(callbackTimestamp).toBeGreaterThanOrEqual(
        latestNonDeferredTimestamp
      )

      // Verify the callback is called BEFORE deferred entries
      // (deferred entries wait for the callback)
      const earliestDeferredTimestamp = Math.min(
        ...deferredPageEntries.map((e) => e.timestamp)
      )
      expect(callbackTimestamp).toBeLessThanOrEqual(earliestDeferredTimestamp)

      // Verify the home page works
      const homeRes = await next.fetch('/')
      expect(homeRes.status).toBe(200)
      expect(await homeRes.text()).toContain('Home Page')

      // Verify the deferred page works
      const deferredRes = await next.fetch('/deferred')
      expect(deferredRes.status).toBe(200)
      expect(await deferredRes.text()).toContain('Deferred Page')
    })
  }
})
