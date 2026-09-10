import { nextTestSetup } from 'e2e-utils'
import { splitResponseWithPPRSentinel } from 'e2e-utils/ppr'
import { load } from 'cheerio'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { basePath, url } from '../variants/base-path'

// The assertions distinguish build-time preludes from request-time rendering.
// TODO(variants): Add deployment coverage for partially resolved shells.
// @force-gate start && turbopack
describe('Variants on partially resolved shells', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    env: {
      BASE_PATH: basePath,
    },
  })

  if (skipped) {
    return
  }

  async function fetchShell(pathname: string, theme: string) {
    const [staticPart, dynamicPart] = await splitResponseWithPPRSentinel(
      async () => {
        const response = await next.fetch(url(pathname), {
          headers: { cookie: `theme=${theme}` },
        })
        expect(response.status).toBe(200)
        if (!response.body) {
          throw new Error('Expected a streamed response body.')
        }
        return response.body
      }
    )

    expect(dynamicPart).not.toBe('')
    return { static$: load(staticPart), dynamic$: load(dynamicPart) }
  }

  it('should serve the build-time shell for each resolved root and combination', async () => {
    for (const language of ['de', 'en']) {
      for (const theme of ['dark', 'light']) {
        for (const slug of ['first', 'second']) {
          const { static$, dynamic$ } = await fetchShell(
            `/${language}/${slug}`,
            theme
          )

          expect(static$('html').attr('lang')).toBe(language)
          expect(static$('#layout-language').text()).toBe(language)
          expect(static$('#variant-shell').text()).toBe(
            `shell:${language}:${theme}:buildtime`
          )
          expect(static$('#variant-fallback').length).toBe(0)
          expect(static$('#slug-fallback').text()).toBe('pending slug')
          expect(static$('#slug').length).toBe(0)
          expect(dynamic$('#slug').text()).toBe(slug)
        }
      }
    }
  })

  it('should leave an undeclared combination in the dynamic response', async () => {
    const { static$, dynamic$ } = await fetchShell('/en/undeclared', 'blue')
    expect(static$('#layout-language').text()).toBe('en')
    expect(static$('#variant-shell').length).toBe(0)
    expect(static$('#variant-fallback').text()).toBe('pending variant')
    expect(dynamic$('#variant-shell').text()).toBe('shell:en:blue:runtime')
    expect(dynamic$('#slug').text()).toBe('undeclared')
  })

  it('should prefetch the build-time variant shell before resolving the slug', async () => {
    for (const language of ['de', 'en']) {
      for (const theme of ['dark', 'light']) {
        const pathname = `/${language}/prefetched`
        let page: Playwright.Page | undefined
        const browser = await next.browser(url(`/${language}`), {
          async beforePageLoad(capturedPage: Playwright.Page) {
            page = capturedPage
            await capturedPage
              .context()
              .addCookies([{ name: 'theme', value: theme, url: next.url }])
          },
        })
        await using _ = defer(async () => {
          await browser.deleteCookies()
          await browser.close()
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
          { includes: `shell:${language}:${theme}:buildtime`, kind: 'static' },
          { includes: `shell:${language}:${theme}:runtime`, block: 'reject' },
          { includes: '"id":"slug","children":"prefetched"', block: 'reject' },
        ])

        await act(
          async () => {
            await browser.elementByCss(`a[href="${url(pathname)}"]`).click()
          },
          { includes: '"id":"slug","children":"prefetched"' }
        )

        expect(await browser.elementByCss('#slug').text()).toBe('prefetched')
        expect(
          await browser
            .elementByCss('#variant-shell')
            .getAttribute('data-language')
        ).toBe(language)
        expect(
          await browser
            .elementByCss('#variant-shell')
            .getAttribute('data-theme')
        ).toBe(theme)
        expect(await browser.eval('location.pathname')).toBe(url(pathname))
      }
    }
  })
})

function defer(callback: () => Promise<void>) {
  return { [Symbol.asyncDispose]: callback }
}
