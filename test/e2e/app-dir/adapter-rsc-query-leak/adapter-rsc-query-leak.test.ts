import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe.each([false, true])(
  'adapter query parameters, collapseAdapterRoutes: %s',
  (collapseAdapterRoutes) => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: {
        TEST_COLLAPSE_ADAPTER_ROUTES: String(collapseAdapterRoutes),
      },
    })

    async function startBrowser(url: string) {
      let act: ReturnType<typeof createRouterAct> | undefined
      const browser = await next.browser(url, {
        permissions: [],
        beforePageLoad(page) {
          act = createRouterAct(page, { includeAppShellRequests: true })
        },
      })
      if (act === undefined) {
        throw new Error('Router act was not initialized')
      }
      return { browser, act }
    }

    describe.each([
      { name: 'no search parameters', search: '', searchParams: {} },
      {
        name: 'user search parameters',
        search:
          '?rscSuffix=first&rscSuffix=second&shellPrefix=user&term=example',
        searchParams: {
          rscSuffix: ['first', 'second'],
          shellPrefix: 'user',
          term: 'example',
        },
      },
    ])('$name', ({ search, searchParams }) => {
      it.each([false, true])(
        'preserves search parameters in the document, draft mode: %s',
        async (draft) => {
          const { browser } = await startBrowser(
            `${draft ? '/draft' : '/article/one'}${search}`
          )
          expect(await browser.elementById('article').text()).toBe(
            `${draft ? 'Draft' : 'Published'} article one`
          )
          expect(JSON.parse(await browser.elementById('query').text())).toEqual(
            searchParams
          )
        }
      )

      it.each([false, true])(
        'preserves search parameters without retrying navigation, draft mode: %s',
        async (draft) => {
          const { browser, act } = await startBrowser(
            draft ? '/draft' : '/article/one'
          )
          const href = `/article/two${search}`
          await act(
            async () => {
              await browser.elementByCss(`a[href="${href}"]`).click()
            },
            { includes: `${draft ? 'Draft' : 'Published'} article two` }
          )
          expect(await browser.elementById('article').text()).toBe(
            `${draft ? 'Draft' : 'Published'} article two`
          )
          expect(JSON.parse(await browser.elementById('query').text())).toEqual(
            searchParams
          )
          expect(new URL(await browser.url()).pathname).toBe('/article/two')
        }
      )

      it('preserves search parameters after a non-draft Server Action', async () => {
        const { browser, act } = await startBrowser(`/article/one${search}`)
        await act(async () => {
          await browser.elementById('update-cookie').click()
        })
        expect(await browser.elementById('shared-render').text()).toBe(
          'Cookie updated'
        )
        expect(await browser.elementById('article').text()).toBe(
          'Published article one'
        )
        expect(JSON.parse(await browser.elementById('query').text())).toEqual(
          searchParams
        )
      })

      it.each(['en', 'de'])(
        'preserves search parameters in a fallback shell document for %s',
        async (locale) => {
          const { browser } = await startBrowser(
            `/${locale}/posts/one${search}`
          )
          expect(await browser.elementById('article').text()).toBe(
            'Published article one'
          )
          expect(JSON.parse(await browser.elementById('query').text())).toEqual(
            searchParams
          )
        }
      )

      it('preserves search parameters when navigating through a fallback shell', async () => {
        const { browser, act } = await startBrowser('/en/posts/one')
        const href = `/en/posts/two${search}`
        await act(
          async () => {
            await browser.elementByCss(`a[href="${href}"]`).click()
          },
          { includes: 'Published article two' }
        )
        expect(await browser.elementById('article').text()).toBe(
          'Published article two'
        )
        expect(JSON.parse(await browser.elementById('query').text())).toEqual(
          searchParams
        )
        expect(new URL(await browser.url()).pathname).toBe('/en/posts/two')
      })
    })
  }
)
