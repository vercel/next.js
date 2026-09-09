import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'
import { hashVariants } from 'next/dist/server/variants/encoding'
import { basePath, url } from '../variants/base-path'

// @force-gate turbopack && (!deploy || adapter)
describe('Variants on a root catch-all', () => {
  const { next, isNextDeploy, skipped } = nextTestSetup({
    files: __dirname,
    env: {
      BASE_PATH: basePath,
      COLLAPSE_ADAPTER_ROUTES:
        process.env.COLLAPSE_ADAPTER_ROUTES === '1' ? '1' : '0',
    },
  })

  if (skipped) {
    return
  }

  it('should preserve the more-specific route without Variants', async () => {
    for (const pathname of [
      '/plain/path/value',
      '/__variants-extra/path/value',
      '/plain/__variants/value',
    ]) {
      const $ = await next.render$(url(pathname))
      expect($('#plain').text()).toBe('plain route')
    }
  })

  it('should reject a client naming the combination, without the catch-all serving the request', async () => {
    // A catch-all matches any pathname, so it would render the pathname that a
    // rejected request is rewritten to, and the client would receive a page for
    // it. The rejection has to hold with such a route present.
    const declared = hashVariants({ 'theme@variants.ts': 'light' })

    for (const pathname of [
      `/__variants/${declared}/built`,
      `/__variants/${declared}/document`,
      `/built?nxtV=${declared}`,
      `/document?nxtV=${declared}`,
    ]) {
      const response = await next.fetch(url(pathname), {
        headers: { cookie: 'theme=dark' },
      })
      const body = await response.text()

      expect(response.status).toBe(404)
      expect(body).not.toContain('id="slug"')
      expect(body).not.toContain('id="theme"')
    }
  })

  it('should resolve unenumerated catch-all params for each combination', async () => {
    for (const slug of ['document', 'nested/document']) {
      for (const theme of ['dark', 'light']) {
        const $ = await next.render$(url(`/${slug}`), undefined, {
          headers: { cookie: `theme=${theme}` },
        })

        expect($('#slug').text()).toBe(slug)
        expect($('#theme').text()).toBe(theme)
      }
    }
  })

  // @force-gate prefetching
  it('should prefetch catch-all params without the internal prefix or payload suffix', async () => {
    const slug = `prefetch-${Date.now()}/child`
    const pathname = `/${slug}`

    async function prefetch() {
      let page: Playwright.Page | undefined

      try {
        const browser = await next.browser(url(`/?slug=${slug}`), {
          async beforePageLoad(capturedPage: Playwright.Page) {
            page = capturedPage
            await capturedPage
              .context()
              .addCookies([{ name: 'theme', value: 'dark', url: next.url }])
          },
        })

        if (!page) {
          throw new Error('The page was not captured before it loaded.')
        }

        const act = createRouterAct(page, { includeAppShellRequests: true })

        await act(async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${pathname}"]`)
            .click()
        }, [
          { includes: `"id":"slug","children":"${slug}"`, kind: 'static' },
          { includes: `"id":"slug","children":"${slug}.rsc"`, block: 'reject' },
          { includes: '"id":"slug","children":"__variants/', block: 'reject' },
        ])

        return { browser, act }
      } catch (error) {
        if (page) {
          await page.context().clearCookies()
          await page.close()
        }
        throw error
      }
    }

    if (isNextDeploy) {
      // Warm the server through real prefetches. Each attempt uses a fresh page
      // so the client router cannot reuse its cached fallback.
      //
      // TODO: Investigate whether deploy should serve the same cold-prefetch
      // content as `next start`. The difference also occurs without Variants.
      await retry(async () => {
        const { browser } = await prefetch()
        await using _ = defer(async () => {
          await browser.deleteCookies()
          await browser.close()
        })
      }, 15000)
    }

    const { browser, act } = await prefetch()
    await using _ = defer(async () => {
      await browser.deleteCookies()
      await browser.close()
    })

    await act(async () => {
      await browser.elementByCss(`a[href="${url(pathname)}"]`).click()
    }, 'no-requests')

    expect(await browser.elementByCss('#slug').text()).toBe(slug)
    expect(await browser.elementByCss('#theme').text()).toBe('dark')
    expect(await browser.eval('location.pathname')).toBe(url(pathname))
  })
})

function defer(callback: () => Promise<void>) {
  return { [Symbol.asyncDispose]: callback }
}
