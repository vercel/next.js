import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/98287
//
// `next/dynamic({ ssr: true })` declared in `pages/_app` is server rendered,
// but under Turbopack its module id was missing from
// `__NEXT_DATA__.dynamicIds`, because Turbopack emits a per-page
// react-loadable manifest and `pages/_app` is a separate entrypoint. Without
// the id the client renders the loadable's fallback while hydrating, React
// reports a mismatch and throws the server rendered subtree away.
describe('next-dynamic-in-custom-app', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getDynamicIds(path: string) {
    const $ = await next.render$(path)
    const nextData = JSON.parse($('#__NEXT_DATA__').html())
    return { $, dynamicIds: nextData.dynamicIds ?? [] }
  }

  describe.each(['/', '/ssr'])('%s', (path) => {
    it('reports both the _app and the page dynamic in __NEXT_DATA__.dynamicIds', async () => {
      const { dynamicIds } = await getDynamicIds(path)

      // One id for the `_app` declared loadable, one for the page declared one.
      expect(dynamicIds).toHaveLength(2)

      // Bundlers that use readable module ids (all but a Turbopack production
      // build) let us pin down which loadable each id belongs to.
      const readableIds = dynamicIds.filter(
        (id: string | number) => typeof id === 'string'
      )
      if (readableIds.length > 0) {
        expect(readableIds).toEqual(
          expect.arrayContaining([expect.stringMatching(/app-header/)])
        )
        expect(readableIds).toEqual(
          expect.arrayContaining([expect.stringMatching(/page-widget/)])
        )
      }
    })

    it('server renders both dynamic components instead of their fallbacks', async () => {
      const { $ } = await getDynamicIds(path)

      expect($('#app-header').text()).toBe('app-level dynamic header')
      expect($('#page-widget').text()).toBe('page-level dynamic widget')
      expect($('#app-header-loading')).toHaveLength(0)
      expect($('#page-widget-loading')).toHaveLength(0)
    })

    it('keeps the server rendered _app chrome after hydration', async () => {
      const browser = await next.browser(path)

      await retry(async () => {
        expect(await browser.elementByCss('#app-header').text()).toBe(
          'app-level dynamic header'
        )
        expect(await browser.eval('window.next.router.isReady')).toBe(true)
      })

      const hydrationErrors = (await browser.log()).filter(
        ({ source, message }) =>
          source === 'error' &&
          /hydrat|Minified React error #(418|423|425)/i.test(message)
      )
      expect(hydrationErrors).toEqual([])
    })
  })
})
