import { createNext } from 'e2e-utils'

// TODO(NAR-423): Migrate to Cache Components.
describe.skip('search-params', () => {
  if ((global as any).isNextDev) {
    test('ppr is disabled in dev', () => {})
    return
  }

  let server
  let next
  afterEach(async () => {
    await next?.destroy()
    server?.close()
  })

  test(
    'updates page data during a nav even if no shared layouts have changed ' +
      '(e.g. updating a search param on the current page)',
    async () => {
      next = await createNext({
        files: __dirname,
      })
      const browser = await next.browser('/')

      // Click a link that updates the current page's search params.
      const link = await browser.elementByCss('a')
      await link.click()

      // Confirm that the page re-rendered with the new search params.
      const searchParamsContainer = await browser.elementById('search-params')
      expect(await searchParamsContainer.innerText()).toBe(
        'Search params: {"blazing":"good"}'
      )
    }
  )
})
