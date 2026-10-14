import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { createRouterAct } from 'router-act'

// @force-gate !dev
describe('cached navigations - root params', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'root-params'),
  })

  it('does not reuse the initial static stage across root param values', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/en/foo', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic slug: foo'
    )
    expect(await browser.elementById('cached-locale').text()).toBe(
      'Cached locale: en'
    )

    await act(async () => {
      await browser.elementByCss('a[href="/de/foo"]').click()

      // The router keeps the resolved English page visible until the German
      // response arrives.
      expect(await browser.elementById('cached-locale').text()).toBe(
        'Cached locale: en'
      )
      expect(await browser.elementById('dynamic-boundary').text()).toBe(
        'Dynamic slug: foo'
      )
    })

    expect(await browser.elementById('cached-locale').text()).toBe(
      'Cached locale: de'
    )
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic slug: foo'
    )
  })

  it('reuses the initial static stage when only a fallback param changes', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/en/foo', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic slug: foo'
    )
    expect(await browser.elementById('cached-locale').text()).toBe(
      'Cached locale: en'
    )

    await act(async () => {
      await browser.elementByCss('a[href="/en/bar"]').click()

      // The router reuses the English static stage and shows a fallback until
      // the new slug's dynamic content arrives.
      expect(await browser.elementById('cached-locale').text()).toBe(
        'Cached locale: en'
      )
      expect(await browser.elementById('dynamic-boundary').text()).toBe(
        'Loading dynamic...'
      )
    })

    expect(await browser.elementById('cached-locale').text()).toBe(
      'Cached locale: en'
    )
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic slug: bar'
    )
  })
})
