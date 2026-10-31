import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

type Tracked = { chunkRequests: string[]; pageErrors: Error[] }

function track(): Tracked & {
  beforePageLoad: (page: import('playwright').Page) => void
} {
  const tracked: Tracked = { chunkRequests: [], pageErrors: [] }
  return {
    ...tracked,
    beforePageLoad(page) {
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (
          url.pathname.includes('/_next/static/') &&
          /\.(js|css)$/.test(url.pathname)
        ) {
          tracked.chunkRequests.push(url.pathname + url.search)
        }
      })
      page.on('pageerror', (error: Error) => {
        tracked.pageErrors.push(error)
      })
    },
  }
}

function duplicateRequests(chunkRequests: string[]) {
  const counts = new Map<string, number>()
  for (const request of chunkRequests) {
    const pathname = request.split('?')[0]
    counts.set(pathname, (counts.get(pathname) ?? 0) + 1)
  }
  return [...counts].filter(([, count]) => count > 1)
}

// A duplicate tag may be served from the memory cache without a new request,
// so also check the DOM directly.
function duplicateTags(browser: Playwright) {
  return browser.eval(() => {
    const seen = new Map<string, number>()
    const elements = document.querySelectorAll(
      // `noModule` polyfill scripts are not Turbopack chunks. With partial
      // prerendering the resumed stream repeats them, which is unrelated.
      'script[src*="/_next/static/"]:not([nomodule]), link[rel=stylesheet][href*="/_next/static/"]'
    )
    for (const element of Array.from(elements)) {
      const url = element.getAttribute('src') ?? element.getAttribute('href')
      const key = `${element.tagName} ${url!.split('?')[0]}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    return [...seen].filter(([, count]) => count > 1)
  })
}

describe('dynamic-chunk-dedupe', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    // Keep the `deploymentId` from next.config.ts in effect (instead of the
    // test harness's immutable assets) so chunk URLs carry `?dpl=`.
    disableAutoSkewProtection: true,
  })

  it('should load every dynamic chunk exactly once', async () => {
    const t = track()
    const browser = await next.browser('/', {
      beforePageLoad: t.beforePageLoad,
    })

    await retry(async () => {
      expect(await browser.elementByCss('#widget-a').text()).toBe('widget a')
      expect(await browser.elementByCss('#widget-b').text()).toBe('widget b')
      expect(await browser.elementByCss('#widget-c').text()).toBe('widget c')
      expect(
        await browser.elementByCss('#styled-server').getComputedCss('color')
      ).toBe('rgb(0, 128, 0)')
      expect(
        await browser.elementByCss('#styled-client').getComputedCss('color')
      ).toBe('rgb(0, 0, 255)')
    })

    expect(t.pageErrors).toEqual([])

    // The chunk loader must recognize the `<script>` / `<link>` tags already in
    // the DOM (including their query suffix) instead of requesting them again.
    expect(duplicateRequests(t.chunkRequests)).toEqual([])
    expect(await duplicateTags(browser)).toEqual([])

    if (!isNextDeploy) {
      // Deployments set their own deployment id.
      expect(
        t.chunkRequests.some((url) => url.includes('dpl=dynamic-chunk-dedupe'))
      ).toBe(true)
    }
  })

  it('should load a next/dynamic chunk announced by a streamed boundary exactly once', async () => {
    const t = track()
    const browser = await next.browser('/streamed', {
      beforePageLoad: t.beforePageLoad,
    })

    await retry(async () => {
      expect(
        await browser.elementByCss('#streamed-widget').getComputedCss('color')
      ).toBe('rgb(220, 20, 60)')
    })

    expect(t.pageErrors).toEqual([])
    expect(duplicateRequests(t.chunkRequests)).toEqual([])
    expect(await duplicateTags(browser)).toEqual([])
  })

  /**
   * Loads `/on-demand`, clicks the button and returns the chunk URLs (with
   * their query) that the click requested.
   */
  async function discoverOnDemandChunks() {
    const t = track()
    const browser = await next.browser('/on-demand', {
      beforePageLoad: t.beforePageLoad,
    })
    await browser.waitForElementByCss('#load')
    const before = t.chunkRequests.length
    await browser.elementByCss('#load').click()
    await browser.waitForElementByCss('#on-demand-widget')
    const urls = [...new Set(t.chunkRequests.slice(before))]
    await browser.close()
    return {
      scripts: urls.filter((url) => url.split('?')[0].endsWith('.js')),
      styles: urls.filter((url) => url.split('?')[0].endsWith('.css')),
    }
  }

  // The Turbopack runtime only looks for existing chunk tags in `<head>`.
  // @force-gate turbopack
  it('should ignore chunk tags in the body when loading a chunk', async () => {
    const { scripts, styles } = await discoverOnDemandChunks()
    expect(scripts.length).toBeGreaterThan(0)
    expect(styles.length).toBeGreaterThan(0)

    const t = track()
    const browser = await next.browser('/on-demand', {
      beforePageLoad: t.beforePageLoad,
    })
    await browser.waitForElementByCss('#load')

    // Inert copies of the chunk tags: they neither execute nor apply. If the
    // runtime treated them as the chunk's tags, it would wait forever for the
    // script to register and the stylesheet would never apply.
    await browser.eval(
      ({ scripts, styles }) => {
        for (const src of scripts) {
          const script = document.createElement('script')
          script.type = 'text/plain'
          script.setAttribute('src', src)
          script.dataset.copy = 'body'
          document.body.appendChild(script)
        }
        for (const href of styles) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.media = 'not all'
          link.setAttribute('href', href)
          link.dataset.copy = 'body'
          document.body.appendChild(link)
        }
      },
      { scripts, styles }
    )

    await browser.elementByCss('#load').click()
    await retry(async () => {
      expect(
        await browser.elementByCss('#on-demand-widget').getComputedCss('color')
      ).toBe('rgb(128, 0, 128)')
    })

    // The runtime inserted its own tags into `<head>` instead.
    const headUrls = await browser.eval(() =>
      Array.from(
        document.head.querySelectorAll('script[src], link[rel=stylesheet]')
      ).map(
        (el) =>
          (el.getAttribute('src') ?? el.getAttribute('href'))!.split('?')[0]
      )
    )
    for (const url of [...scripts, ...styles]) {
      expect(headUrls).toContain(url.split('?')[0])
    }
    expect(t.pageErrors).toEqual([])
  })

  // HMR only removes the chunk tags it finds in `<head>`.
  // @force-gate turbopack && dev
  it('should only remove head chunk tags when a CSS chunk is unloaded', async () => {
    const { styles } = await discoverOnDemandChunks()
    expect(styles.length).toBeGreaterThan(0)

    const browser = await next.browser('/on-demand')
    await browser.elementByCss('#load').click()
    await retry(async () => {
      expect(
        await browser.elementByCss('#on-demand-widget').getComputedCss('color')
      ).toBe('rgb(128, 0, 128)')
    })

    await browser.eval((styles) => {
      for (const href of styles) {
        for (const [parent, rel, copy] of [
          [document.head, 'stylesheet', 'head'],
          [document.body, 'stylesheet', 'body'],
          [document.body, 'preload', 'body-preload'],
        ] as const) {
          const link = document.createElement('link')
          link.rel = rel
          if (rel === 'stylesheet') link.media = 'not all'
          else link.as = 'style'
          link.setAttribute('href', href)
          link.dataset.copy = copy
          parent.appendChild(link)
        }
      }
    }, styles)

    // Dropping the CSS import removes the CSS chunk, which unloads it.
    await next.patchFile(
      'app/on-demand/on-demand-widget.tsx',
      (content) =>
        content!
          .replace("import styles from './on-demand-widget.module.css'\n", '')
          .replace(' className={styles.text}', ''),
      async () => {
        await retry(async () => {
          expect(
            await browser
              .elementByCss('#on-demand-widget')
              .getComputedCss('color')
          ).toBe('rgb(0, 0, 0)')
          expect(
            await browser.eval(
              () => document.querySelectorAll('[data-copy=head]').length
            )
          ).toBe(0)
        })
        expect(
          await browser.eval(() =>
            Array.from(document.querySelectorAll('[data-copy]')).map(
              (el) => (el as HTMLElement).dataset.copy
            )
          )
        ).toEqual(styles.flatMap(() => ['body', 'body-preload']))
      }
    )
  })
})
