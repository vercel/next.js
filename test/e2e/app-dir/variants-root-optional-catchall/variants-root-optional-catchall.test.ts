import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'
import { basePath, url } from '../variants/base-path'

// @force-gate turbopack && (!deploy || adapter)
describe('Variants on an optional root catch-all', () => {
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

  it('should serve the built param for each combination', async () => {
    for (const theme of ['dark', 'light']) {
      const $ = await next.render$(url('/built'), undefined, {
        headers: { cookie: `theme=${theme}` },
      })
      expect($('#result').text()).toBe(`/built:${theme}`)
    }
  })

  // @force-gate prefetching
  it('should prefetch the unenumerated root without changing the combination hash', async () => {
    for (const theme of ['dark', 'light']) {
      async function prefetch() {
        let page: Playwright.Page | undefined

        try {
          const browser = await next.browser(url('/hub'), {
            async beforePageLoad(capturedPage: Playwright.Page) {
              page = capturedPage
              await capturedPage
                .context()
                .addCookies([{ name: 'theme', value: theme, url: next.url }])
            },
          })

          if (!page) {
            throw new Error('The page was not captured before it loaded.')
          }

          const act = createRouterAct(page, { includeAppShellRequests: true })
          await act(
            async () => {
              await browser
                .elementByCss('input[data-link-accordion="/"]')
                .click()
            },
            {
              includes: `"id":"result","children":"/:${theme}"`,
              kind: 'static',
            }
          )

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
        // Warm only through prefetches so no document request can prepare the
        // missing root artifact.
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
        await browser.elementByCss(`a[href="${url('/')}"]`).click()
      }, 'no-requests')

      expect(await browser.elementByCss('#result').text()).toBe(`/:${theme}`)
      expect(await browser.eval('location.pathname')).toBe(url('/'))
    }
  })
})

function defer(callback: () => Promise<void>) {
  return { [Symbol.asyncDispose]: callback }
}
