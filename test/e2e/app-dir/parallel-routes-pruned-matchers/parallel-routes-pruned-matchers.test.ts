import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-pruned-matchers', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    ['/named-catchall/foo', 'named-catchall-layout'],
    ['/named-catchall/anything', 'named-catchall-layout'],
    ['/children-catchall/foo', 'children-catchall-layout'],
    ['/children-catchall/bar', 'children-catchall-layout'],
    ['/optional-children-catchall', 'optional-children-catchall-layout'],
    [
      '/optional-children-catchall/anything',
      'optional-children-catchall-layout',
    ],
    ['/split-matcher/anything', 'split-matcher-layout'],
    ['/nested-parallel/anything', 'nested-parallel-layout'],
    ['/grouped/anything', 'grouped-layout'],
  ])(
    'omits the permanently-not-found matcher for %s',
    async (path, layoutId) => {
      const $ = await next.render$(path)

      expect($.root().text()).toContain('root not found')
      expect($(`#${layoutId}`).length).toBe(0)
    }
  )

  it('keeps a catch-all matcher when the sibling slot has a default', async () => {
    const $ = await next.render$('/valid/foo')

    expect($('#valid-catchall-page').text()).toBe('valid catch-all')
    expect($('#valid-slot-default').text()).toBe('valid slot default')
  })

  it('keeps a catch-all matcher when every sibling slot matches', async () => {
    const $ = await next.render$('/valid/special')

    expect($('#valid-catchall-page').text()).toBe('valid catch-all')
    expect($('#valid-slot-page').text()).toBe('valid slot page')
  })

  it('keeps the specific sibling of a pruned optional catch-all', async () => {
    const $ = await next.render$('/optional-children-catchall/specific')

    expect($('#optional-specific-page').text()).toBe('optional specific page')
    expect($('#optional-slot-page').text()).toBe('optional slot page')
  })

  it.each(['foo', 'bar'])(
    'keeps /split-matcher/%s while pruning the broader matcher',
    async (segment) => {
      const $ = await next.render$(`/split-matcher/${segment}`)

      expect($(`#split-${segment}-page`).text()).toBe(`${segment} page`)
      expect($('#split-slot-catchall').text()).toBe('split slot catch-all')
    }
  )

  it('keeps a matcher when an explicit default calls notFound', async () => {
    const response = await next.fetch('/default-not-found/anything')

    expect(response.status).toBe(404)
  })

  it('prunes a matcher with an incomplete nested parallel route', async () => {
    const $ = await next.render$('/nested-parallel/specific')

    expect($('#nested-specific-page').text()).toBe('nested specific page')
    expect($('#nested-outer-specific-page').text()).toBe(
      'nested outer specific page'
    )
    expect($('#nested-inner-specific-page').text()).toBe(
      'nested inner specific page'
    )
  })

  it('keeps the specific sibling of a pruned route-group matcher', async () => {
    const $ = await next.render$('/grouped/specific')

    expect($('#grouped-specific-page').text()).toBe('grouped specific page')
    expect($('#grouped-slot-page').text()).toBe('grouped slot page')
  })

  if (isNextStart) {
    it('does not emit entrypoints for pruned matchers', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/server/app-paths-manifest.json')
      )
      const appPaths = Object.keys(manifest)

      expect(
        appPaths.filter(
          (path) =>
            path.startsWith('/named-catchall/') ||
            path.startsWith('/children-catchall/') ||
            path.includes('/optional-children-catchall/[[...slug]]/') ||
            path.includes('/split-matcher/[...parts]/') ||
            path.includes('/nested-parallel/[...slug]/') ||
            path.includes('/grouped/[...slug]/')
        )
      ).toEqual([])
      expect(appPaths).toContain('/valid/[...slug]/page')
      expect(appPaths).toContain('/optional-children-catchall/specific/page')
      expect(appPaths).toContain('/split-matcher/foo/page')
      expect(appPaths).toContain('/split-matcher/bar/page')
      expect(appPaths).toContain('/default-not-found/[...slug]/page')
      expect(appPaths).toContain('/nested-parallel/specific/page')
      expect(appPaths).toContain('/(pruning-group)/grouped/specific/page')
    })
  }
})
