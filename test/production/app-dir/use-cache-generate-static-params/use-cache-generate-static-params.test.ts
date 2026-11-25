import { nextTestSetup } from 'e2e-utils'

describe('use-cache-generate-static-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('includes grouped page and normalized pathname tags for caches in generateStaticParams', async () => {
    // The only cached function in this fixture is called by generateStaticParams,
    // so these are its tags, not tags from rendering the page.
    const tags = [
      ...next.cliOutput.matchAll(
        /generateStaticParams cache tags: (\[[^\n]+\])/g
      ),
    ].map((match) => JSON.parse(match[1]))
    expect(tags.length).toBeGreaterThan(0)
    for (const entry of tags) {
      expect(entry).toEqual([
        '_N_T_/layout',
        '_N_T_/(group)/layout',
        '_N_T_/(group)/static-params/layout',
        '_N_T_/(group)/static-params/[slug]/layout',
        '_N_T_/(group)/static-params/[slug]/page',
        '_N_T_/static-params/[slug]',
      ])
    }

    const $ = await next.render$('/static-params/known')
    expect($('p').text()).toBe('known')
  })
})
