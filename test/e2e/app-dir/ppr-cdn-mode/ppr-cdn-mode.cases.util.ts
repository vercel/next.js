import type { NextInstance } from 'e2e-utils'
import { splitResponseWithPPRSentinel } from 'e2e-utils/ppr'
import { retry } from 'next-test-utils'
import cheerio from 'cheerio'
import type { FakeCDN } from '../../../lib/fake-cdn.mjs'
import {
  CLIENT_RENDER_INSTRUCTION,
  clickCounter,
  countClientRenderedBoundaries,
  expectCacheableByCdn,
  expectHydrated,
  expectNoConsoleErrors,
  expectStoredPartialDocument,
  getClientRenderedBoundaryCount,
  holdRequests,
  isDynamicRSCRequest,
  openPage,
  serveDocumentFromSnapshot,
  snapshotDocument,
  waitForHole,
} from './ppr-cdn-mode.util'

// The cases that run both with Cached Navigations on (the default) and off.

/** The document that a CDN stores for `/partial`. */
export async function expectPartialDocumentContract(next: NextInstance) {
  const [document, resumed] = await splitResponseWithPPRSentinel(async () => {
    const res = await next.fetch('/partial')
    expect(res.status).toBe(200)
    expectCacheableByCdn(res.headers)
    return res.body
  })
  // Nothing was resumed after the stored document.
  expect(resumed).toBe('')
  expectStoredPartialDocument(document)

  const $ = cheerio.load(document)
  expect($('#heading').text()).toBe('Static heading')
  expect($('#fallback').text()).toBe('Loading…')
  expect($('#dynamic').length).toBe(0)

  // The one hole is a pending boundary, and an `$RX` with an empty digest
  // switches it to client rendering.
  const pending = [...document.matchAll(/<!--\$\?--><template id="([^"]+)"/g)]
  const clientRendered = [...document.matchAll(/\$RX\("([^"]+)",""\)/g)].map(
    (match) => match[1]
  )
  expect(pending.map((match) => match[1])).toEqual(clientRendered)
  expect(clientRendered).toHaveLength(1)
}

/** A CDN hit for `/partial`, then one dynamic request through the CDN. */
export async function expectServedFromCdn(next: NextInstance, cdn: FakeCDN) {
  const isRefresh = (request: FakeCDN['requests'][number]) =>
    request.headers['rsc'] === '1' &&
    request.headers['next-router-prefetch'] === undefined

  const firstLoadStart = cdn.requests.length
  const warm = await openPage(next, '/partial', { baseUrl: cdn.port })
  await expectHydrated(warm.browser)
  await waitForHole(warm.browser)
  await expectNoConsoleErrors(warm.browser)
  expect(
    cdn.requests
      .slice(firstLoadStart)
      .filter((request) => request.url === '/partial')
      .map((request) => request.result)
  ).toEqual(['miss'])

  const secondLoadStart = cdn.requests.length
  let hold!: Awaited<ReturnType<typeof holdRequests>>
  const { browser, dynamicRSCRequests } = await openPage(next, '/partial', {
    baseUrl: cdn.port,
    async beforePageLoad(page) {
      await countClientRenderedBoundaries(page)
      hold = await holdRequests(page, isDynamicRSCRequest)
    },
  })
  await expectHydrated(browser)
  expect(
    cdn.requests
      .slice(secondLoadStart)
      .filter((request) => request.url === '/partial')
      .map((request) => request.result)
  ).toEqual(['hit'])

  // The static part and the fallback show while the refresh is held.
  expect(await browser.elementById('heading').text()).toBe('Static heading')
  expect(await browser.elementById('fallback').text()).toBe('Loading…')
  expect(await getClientRenderedBoundaryCount(browser)).toBe(1)
  await retry(async () => {
    expect(hold.held).toHaveLength(1)
  })

  hold.release()
  await waitForHole(browser)
  expect(dynamicRSCRequests).toHaveLength(1)
  // The refresh went past the CDN to Next.js.
  expect(
    cdn.requests
      .slice(secondLoadStart)
      .filter(isRefresh)
      .map((request) => request.result)
  ).toEqual(['uncacheable'])
  await expectNoConsoleErrors(browser)
}

/**
 * The static part is interactive while the refresh is held, and keeps its
 * state once the refresh fills the hole.
 */
export async function expectClientStateSurvivesRefresh(next: NextInstance) {
  const snapshot = await snapshotDocument(next, '/partial')
  let hold!: Awaited<ReturnType<typeof holdRequests>>
  const { browser, documents } = await openPage(next, '/partial', {
    async beforePageLoad(page) {
      await serveDocumentFromSnapshot(page, '/partial', snapshot)
      hold = await holdRequests(page, isDynamicRSCRequest)
    },
  })
  await expectHydrated(browser)
  await retry(async () => {
    expect(hold.held).toHaveLength(1)
  })

  await browser.eval(() => {
    ;(window as any).__counterNode = document.getElementById('counter')
  })
  await clickCounter(browser, 3)
  expect(await browser.elementById('fallback').text()).toBe('Loading…')

  hold.release()
  await waitForHole(browser)
  // The refresh filled the hole without remounting the static part.
  expect(await browser.elementById('counter').text()).toBe('Count: 3')
  expect(
    await browser.eval(
      () => (window as any).__counterNode === document.getElementById('counter')
    )
  ).toBe(true)
  expect(documents).toHaveLength(1)
  await expectNoConsoleErrors(browser)
}

/** Sibling and nested holes all fill from the one refresh. */
export async function expectMultipleHolesFillFromOneRequest(
  next: NextInstance
) {
  const snapshot = await snapshotDocument(next, '/partial-multi')
  // The nested hole isn't in the shell, so only the two outer holes are.
  expect(snapshot.body.match(CLIENT_RENDER_INSTRUCTION)).toHaveLength(2)

  const { browser, dynamicRSCRequests } = await openPage(
    next,
    '/partial-multi',
    {
      beforePageLoad: (page) =>
        serveDocumentFromSnapshot(page, '/partial-multi', snapshot),
    }
  )
  await expectHydrated(browser)
  for (const id of ['dynamic-a', 'dynamic-b', 'dynamic-nested']) {
    await waitForHole(browser, id)
  }
  expect(dynamicRSCRequests).toHaveLength(1)
  await expectNoConsoleErrors(browser)
}

/** A server action rendered inside a hole updates the shell's cached value. */
export async function expectServerActionUpdatesPage(next: NextInstance) {
  const { browser, documents } = await openPage(next, '/action')
  await expectHydrated(browser)
  await waitForHole(browser, 'bump')
  const version = Number(
    (await browser.elementById('static-value').text()).replace('version ', '')
  )
  await clickCounter(browser, 2)

  await browser.elementById('bump').click()
  await retry(async () => {
    expect(await browser.elementById('static-value').text()).toBe(
      `version ${version + 1}`
    )
  })
  expect(await browser.elementById('counter').text()).toBe('Count: 2')
  expect(documents).toHaveLength(1)
  await expectNoConsoleErrors(browser)
}
