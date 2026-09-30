import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-route-refresh-after-navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function refreshBackground(
    browser: Awaited<ReturnType<typeof next.browser>>,
    origin: number,
    page: string,
    value: string,
    nestedValue?: string
  ) {
    const previousRender = await browser
      .elementByCss('#background-render:visible')
      .text()
    const previousNestedRender =
      nestedValue === undefined
        ? undefined
        : await browser.elementByCss('#nested-render:visible').text()
    const dialogURL = await browser.url()

    await browser.elementByCss('#refresh:visible').click()
    // Require fresh data so an unchanged DOM cannot hide a failed refresh.
    await retry(async () => {
      const state = await browser.eval(() => {
        // Activity can retain earlier routes in the DOM with display: none.
        // Read only the content currently shown to the user.
        const visibleText = (selector: string) =>
          Array.from(document.querySelectorAll(selector)).find(
            (element) => element.getClientRects().length > 0
          )?.textContent

        return {
          origin: performance.timeOrigin,
          render: visibleText('#background-render'),
          page: visibleText('#background-page'),
          value: visibleText('#background-value'),
          nestedRender: visibleText('#nested-render'),
          nestedValue: visibleText('#nested-value'),
        }
      })
      expect(state.origin).toBe(origin)
      expect(state.page).toBe(page)
      expect(state.value).toBe(value)
      expect(state.render).toBeTruthy()
      expect(state.render).not.toBe(previousRender)
      if (nestedValue !== undefined) {
        expect(state.nestedValue).toBe(nestedValue)
        expect(state.nestedRender).toBeTruthy()
        expect(state.nestedRender).not.toBe(previousNestedRender)
      }
    })
    expect(await browser.url()).toBe(dialogURL)
    expect(await browser.hasElementByCss('#dialog-kind:visible')).toBe(true)
  }

  describe.each([
    { name: 'flat', prefix: '/' },
    { name: 'grouped', prefix: '/grouped-' },
  ])('$name background', ({ prefix }) => {
    it.each([
      { name: 'unchanged background', navigate: false, query: false },
      { name: 'changed background', navigate: true, query: false },
      {
        name: 'changed background with search params',
        navigate: true,
        query: true,
      },
    ])(
      'refreshes $name without replacing the document',
      async ({ navigate, query }) => {
        const home = `${prefix}home${query ? '?value=first' : ''}`
        const browser = await next.browser(home)
        const origin = await browser.eval(() => performance.timeOrigin)

        await browser.elementByCss('#open-dialog:visible').click()
        await browser.elementByCss('#mutate:visible').click()
        await retry(async () => {
          expect(
            await browser.elementByCss('#dialog-kind:visible').text()
          ).toBe('result')
        })
        await browser.elementByCss('#close:visible').click()
        await retry(async () => {
          const url = new URL(await browser.url())
          expect(url.pathname + url.search).toBe(home)
          expect(await browser.hasElementByCss('#dialog-kind:visible')).toBe(
            false
          )
        })
        if (navigate) {
          await browser.elementByCss('#about:visible').click()
          await retry(async () => {
            expect(
              await browser.elementByCss('#background-page:visible').text()
            ).toBe('about')
          })
        }

        const backgroundPath = new URL(await browser.url())
        await browser.elementByCss('#open-dialog:visible').click()
        await retry(async () => {
          expect(
            await browser.elementByCss('#dialog-kind:visible').text()
          ).toBe('edit')
        })
        expect(await browser.eval(() => performance.timeOrigin)).toBe(origin)

        await refreshBackground(
          browser,
          origin,
          navigate ? 'about' : 'home',
          query ? 'second' : 'none'
        )

        const dialogURL = new URL(await browser.url())
        expect(dialogURL.pathname).toBe('/edit')
        expect(dialogURL.searchParams.get('closePath')).toBe(
          backgroundPath.pathname + backgroundPath.search
        )
        await browser.elementByCss('#close:visible').click()
        await retry(async () => {
          expect(await browser.url()).toBe(backgroundPath.href)
          expect(await browser.hasElementByCss('#dialog-kind:visible')).toBe(
            false
          )
        })
        expect(await browser.eval(() => performance.timeOrigin)).toBe(origin)
      }
    )
  })

  it('refreshes nested inactive slots using their distinct original URLs', async () => {
    const browser = await next.browser('/nested/item?value=retained')
    const origin = await browser.eval(() => performance.timeOrigin)
    const originalNestedRender = await browser
      .elementByCss('#nested-render:visible')
      .text()

    await browser.elementByCss('#nested-home:visible').click()
    await retry(async () => {
      expect(
        await browser.elementByCss('#background-page:visible').text()
      ).toBe('home')
      expect(await browser.elementByCss('#nested-value:visible').text()).toBe(
        'retained'
      )
      expect(await browser.elementByCss('#nested-render:visible').text()).toBe(
        originalNestedRender
      )
    })
    await browser.elementByCss('#open-dialog:visible').click()
    await browser.elementByCss('#mutate:visible').click()
    await retry(async () => {
      expect(await browser.elementByCss('#dialog-kind:visible').text()).toBe(
        'result'
      )
    })
    await browser.elementByCss('#close:visible').click()
    await retry(async () => {
      const url = new URL(await browser.url())
      expect(url.pathname + url.search).toBe('/nested/home?value=first')
      expect(await browser.hasElementByCss('#dialog-kind:visible')).toBe(false)
    })
    await browser.elementByCss('#about:visible').click()
    await retry(async () => {
      expect(
        await browser.elementByCss('#background-page:visible').text()
      ).toBe('about')
      expect(
        await browser.elementByCss('#background-value:visible').text()
      ).toBe('second')
      expect(await browser.elementByCss('#nested-value:visible').text()).toBe(
        'retained'
      )
    })
    await browser.elementByCss('#open-dialog:visible').click()
    await retry(async () => {
      expect(await browser.elementByCss('#dialog-kind:visible').text()).toBe(
        'edit'
      )
    })

    // The outer inactive branch belongs to /nested/about?value=second, but
    // its nested @details slot still belongs to /nested/item?value=retained.
    await refreshBackground(browser, origin, 'about', 'second', 'retained')
  })
})
