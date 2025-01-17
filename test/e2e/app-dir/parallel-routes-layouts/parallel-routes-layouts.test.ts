import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-layouts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should properly render layouts for multiple slots', async () => {
    const browser = await next.browser('/nested')

    let layouts = await getLayoutHeadings(browser)
    expect(layouts).toHaveLength(4)
    expect(layouts).toEqual(
      expect.arrayContaining([
        'Root Layout',
        'Nested Layout',
        '@foo Layout',
        '@bar Layout',
      ])
    )

    // ensure nested/page is showing its contents
    expect(await browser.elementById('nested-children').text()).toBe(
      'Hello from Nested'
    )

    // Ensure each slot is showing its contents
    expect(await browser.elementById('foo-children').text()).toBe('Foo Slot')
    expect(await browser.elementById('bar-children').text()).toBe('Bar Slot')

    // Navigate to a subroute that only has a match for the @foo slot
    await browser.elementByCss('[href="/nested/subroute"]').click()
    await retry(async () => {
      // the bar slot has a match for the subroute, so we expect it to be rendered
      expect(await browser.elementById('bar-children').text()).toBe('Subroute')

      // We still expect the previous active slots to be visible until reload even if they don't match
      layouts = await getLayoutHeadings(browser)
      expect(layouts).toEqual(
        expect.arrayContaining([
          'Root Layout',
          'Nested Layout',
          '@foo Layout',
          '@bar Layout',
        ])
      )

      expect(await browser.elementById('foo-children').text()).toBe('Foo Slot')

      expect(await browser.elementById('nested-children').text()).toBe(
        'Hello from Nested'
      )
    })

    // Trigger a reload, which will clear the previous active slots and show the ones that explicitly have matched
    await browser.refresh()

    layouts = await getLayoutHeadings(browser)

    // the foo slot does not match on the subroute, so we don't expect the layout or page to be rendered
    expect(layouts).toHaveLength(3)
    expect(layouts).toEqual(
      expect.arrayContaining(['Root Layout', 'Nested Layout', '@bar Layout'])
    )

    // we should now see defaults being rendered for both the page & foo slots
    expect(await browser.elementById('nested-children').text()).toBe(
      'default page'
    )
    expect(await browser.elementById('foo-slot').text()).toBe('@foo default')
  })
})

async function getLayoutHeadings(browser): Promise<string[]> {
  const elements = await browser.elementsByCss('h1')
  return Promise.all(elements.map(async (el) => await el.innerText()))
}
