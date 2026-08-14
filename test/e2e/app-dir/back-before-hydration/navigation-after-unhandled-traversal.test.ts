import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// Chases an intermittent hang seen once in deploy mode with cacheComponents
// and cachedNavigations: after the router declines to replay a pre-hydration
// traversal, clicking a link sometimes never paints the new page. The same
// scenario passes in dev, in start mode with both bundlers, and on a rerun of
// the same deploy job, so this file repeats just that scenario and reports
// what the page was doing while the click failed to land.
//
// The question it answers: does the click produce an RSC request that never
// resolves, or does the router never request anything at all?

const ITERATIONS = Number(process.env.BBH_HANG_ITERATIONS ?? 5)

type Snapshot = {
  href: string
  heading: string | null
  historyState: unknown
  readyState: string
}

describe('navigation after an unhandled pre-hydration traversal', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function stallScripts(page: Playwright.Page) {
    let stalling = true
    const stalled: Array<() => void> = []
    await page.route('**/_next/static/**', async (route) => {
      if (stalling && route.request().resourceType() === 'script') {
        await new Promise<void>((resolve) => stalled.push(resolve))
      }
      await route.continue()
    })
    return function releaseScripts() {
      stalling = false
      for (const release of stalled) release()
    }
  }

  function waitForPage(
    browser: Awaited<ReturnType<typeof next.browser>>,
    headingSelector: string
  ) {
    return browser.elementByCss(headingSelector, {
      waitUntil: false,
      timeout: 10_000,
    })
  }

  async function clickThenReloadStalled(
    startPath: string,
    linkId: string,
    headingSelectorAfterClick: string
  ) {
    let page: Playwright.Page
    const browser = await next.browser(startPath, {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })

    await browser.elementById(linkId).click()
    await waitForPage(browser, headingSelectorAfterClick)

    const releaseScripts = await stallScripts(page)
    await browser.refresh({ waitUntil: 'commit' })
    await page.evaluate('window.__stayed = true')

    return { browser, page, releaseScripts }
  }

  describe.each([
    { label: 'no Suspense boundary above the page', prefix: '' },
    { label: 'Suspense boundary above the page', prefix: '/suspense' },
  ])('$label', ({ prefix }) => {
    const homePath = prefix === '' ? '/' : prefix

    it.each(Array.from({ length: ITERATIONS }, (_, i) => i + 1))(
      'reaches home on the click after the declined traversal (run %i)',
      async () => {
        const { browser, page, releaseScripts } = await clickThenReloadStalled(
          homePath,
          'to-post',
          '#post'
        )

        // Everything the page does from here on, so a hang can be told apart
        // from a request that never comes back.
        const traffic: string[] = []
        const stamp = () => new Date().toISOString().slice(11, 23)
        page.on('request', (r) =>
          traffic.push(
            `${stamp()} -> ${r.method()} ${r.url()} [${r.resourceType()}]`
          )
        )
        page.on('response', (r) =>
          traffic.push(`${stamp()} <- ${r.status()} ${r.url()}`)
        )
        page.on('requestfailed', (r) =>
          traffic.push(`${stamp()} !! ${r.url()} ${r.failure()?.errorText}`)
        )
        page.on('console', (m) =>
          traffic.push(`${stamp()} console.${m.type()} ${m.text()}`)
        )
        page.on('pageerror', (e) =>
          traffic.push(`${stamp()} pageerror ${e.message}`)
        )

        await browser.back({ waitUntil: 'commit' })
        await page.evaluate("window.__thirdPartyPush = 'effect'")
        releaseScripts()

        await retry(async () => {
          expect(await browser.eval('window.__stayed')).toBe(true)
          expect(new URL(await browser.url()).search).toBe('?tp=1')
          expect(await browser.elementByCss('h1').text()).toBe('Post')
        })

        const snapshot = (): Promise<Snapshot> =>
          page.evaluate(() => ({
            href: location.href,
            heading: document.querySelector('h1')?.textContent ?? null,
            historyState: history.state,
            readyState: document.readyState,
          }))

        const before = await snapshot()
        await browser.elementById('to-home').click()

        // Same budget as waitForPage, but recording what changes instead of
        // only whether the heading arrived.
        const states: Snapshot[] = []
        const deadline = Date.now() + 10_000
        let arrived = false
        while (Date.now() < deadline) {
          const state = await snapshot()
          const last = states[states.length - 1]
          if (!last || JSON.stringify(last) !== JSON.stringify(state)) {
            states.push(state)
          }
          if (await page.$('#home')) {
            arrived = true
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 250))
        }

        if (!arrived) {
          throw new Error(
            [
              'The click on #to-home never painted home.',
              `before the click: ${JSON.stringify(before)}`,
              'states after the click:',
              ...states.map((s) => `  ${JSON.stringify(s)}`),
              'page activity:',
              ...traffic.map((line) => `  ${line}`),
            ].join('\n')
          )
        }
      }
    )
  })
})
