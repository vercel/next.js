import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-catchall-slotted-non-catchalls', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match default and dynamic segment paths before catch-all', async () => {
    let browser = await next.browser('/en/catchall/page')

    // we have a top-level catch-all
    expect(await browser.elementById('children').text()).toBe(
      '/[locale]/[[...catchAll]]/page.tsx'
    )

    browser = await next.browser('/en/nested')

    // we're now at the /[locale]/nested segment, which overrides the top-level catch-all, and there is a page defined to be matched
    expect(await browser.elementById('nested-children').text()).toBe(
      '/[locale]/nested/page.tsx'
    )

    // since there is a default defined in @slot0, we expect that to match
    expect(await browser.elementById('slot0').text()).toBe(
      '/[locale]/nested/@slot0/default.tsx'
    )

    // since there is a default defined in @slot1, we expect that to match
    expect(await browser.elementById('slot1').text()).toBe(
      '/[locale]/nested/@slot1/default.tsx'
    )

    browser = await next.browser('/en/nested/foo')

    // we're now at the /[locale]/nested/foo segment, which overrides the top-level catch-all, and there is a default page there to be matched
    expect(await browser.elementById('nested-children').text()).toBe(
      '/[locale]/nested/default.tsx'
    )

    // since there is a page defined in @slot0/foo, we expect that to match
    expect(await browser.elementById('slot0').text()).toBe(
      '/[locale]/nested/@slot0/foo/page.tsx'
    )

    // since there is a default defined in @slot1 and no page defined in @slot1/foo, we expect the default page to be matched
    expect(await browser.elementById('slot1').text()).toBe(
      '/[locale]/nested/@slot1/default.tsx'
    )

    browser = await next.browser('/en/nested/bar')

    // we're now at the /[locale]/nested/bar segment, which overrides the top-level catch-all, and there is a default page there to be matched
    expect(await browser.elementById('nested-children').text()).toBe(
      '/[locale]/nested/default.tsx'
    )

    // since there is a page defined in @slot0/bar, we expect that to match
    expect(await browser.elementById('slot0').text()).toBe(
      '/[locale]/nested/@slot0/bar/page.tsx'
    )

    // since there is a default defined in @slot1 and no page defined in @slot1/bar, we expect the default page to be matched
    expect(await browser.elementById('slot1').text()).toBe(
      '/[locale]/nested/@slot1/default.tsx'
    )

    browser = await next.browser('/en/nested/baz')

    // we're now at the /[locale]/nested/baz segment, which overrides the top-level catch-all, and there is a default page there to be matched
    expect(await browser.elementById('nested-children').text()).toBe(
      '/[locale]/nested/default.tsx'
    )

    // since there is a default defined in @slot0 and no page defined in @slot0/baz, we expect the default page to be matched
    expect(await browser.elementById('slot0').text()).toBe(
      '/[locale]/nested/@slot0/default.tsx'
    )

    // since there is a page defined in @slot1/baz, we expect that to match
    expect(await browser.elementById('slot1').text()).toBe(
      '/[locale]/nested/@slot1/baz/page.tsx'
    )

    browser = await next.browser('/en/nested/qux')

    // we do not have any /qux in any of the slots inside nested, so back to matching with top-level catch-all
    expect(await browser.elementById('children').text()).toBe(
      '/[locale]/[[...catchAll]]/page.tsx'
    )
  })
})
