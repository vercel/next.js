import { nextTestSetup } from 'e2e-utils'

const WITH_PPR = !!process.env.__NEXT_EXPERIMENTAL_PPR

describe('dynamic-io', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  let cliIndex = 0
  beforeEach(() => {
    cliIndex = next.cliOutput.length
  })
  function getLines(containing: string): Array<string> {
    const warnings = next.cliOutput
      .slice(cliIndex)
      .split('\n')
      .filter((l) => l.includes(containing))

    cliIndex = next.cliOutput.length
    return warnings
  }

  if (WITH_PPR) {
    it('should partially prerender pages that await searchParams in a server component', async () => {
      let $ = await next.render$(
        '/search/async/server/await_boundary?sentinel=hello'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('main').text()).toContain('inner loading...')
        expect($('main').text()).not.toContain('outer loading...')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/async/server/await_root?sentinel=hello')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should partially prerender pages that `use` searchParams in a server component', async () => {
      let $ = await next.render$(
        '/search/async/server/use_boundary?sentinel=hello'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('main').text()).toContain('inner loading...')
        expect($('main').text()).not.toContain('outer loading...')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/async/server/use_root?sentinel=hello')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should partially prerender pages that `use` searchParams in a client component', async () => {
      let $ = await next.render$(
        '/search/async/client/use_boundary?sentinel=hello'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('main').text()).toContain('inner loading...')
        expect($('main').text()).not.toContain('outer loading...')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/async/client/use_root?sentinel=hello')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  } else {
    it('should not prerender pages that await searchParams in a server component', async () => {
      let $ = await next.render$(
        '/search/async/server/await_boundary?sentinel=hello'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/async/server/await_root?sentinel=hello')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should not prerender pages that `use` searchParams in a server component', async () => {
      let $ = await next.render$(
        '/search/async/server/use_boundary?sentinel=hello'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/async/server/use_root?sentinel=hello')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should not prerender pages that `use` searchParams in a client component', async () => {
      let $ = await next.render$(
        '/search/async/client/use_boundary?sentinel=hello'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/async/client/use_root?sentinel=hello')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that access a searchParam property synchronously in a server component', async () => {
      let $ = await next.render$(
        '/search/sync/server/access_boundary?sentinel=hello'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'searchParam property was accessed directly with `searchParams.sentinel`'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at buildtime')
        expect($('main').text()).not.toContain('inner loading...')
        // This test case aborts synchronously and the later component render
        // triggers the outer boundary
        expect($('main').text()).toContain('outer loading...')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/sync/server/access_root?sentinel=hello')
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'searchParam property was accessed directly with `searchParams.sentinel`'
          ),
        ])
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should partially prerender pages that access a searchParam property synchronously in a client component', async () => {
      let $ = await next.render$(
        '/search/sync/client/access_boundary?sentinel=hello'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'searchParam property was accessed directly with `searchParams.sentinel`'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at buildtime')
        expect($('main').text()).toContain('inner loading...')
        expect($('main').text()).not.toContain('outer loading...')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/sync/client/access_root?sentinel=hello')
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'searchParam property was accessed directly with `searchParams.sentinel`'
          ),
        ])
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should partially prerender pages that checks for the existence of a searchParam property synchronously in a server component', async () => {
      let $ = await next.render$(
        '/search/sync/server/has_boundary?sentinel=hello'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            '`Reflect.has(searchParams, "sentinel"`, `"sentinel" in searchParams`, or similar'
          ),
          expect.stringContaining(
            '`Reflect.has(searchParams, "foo"`, `"foo" in searchParams`, or similar'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at buildtime')
        expect($('main').text()).not.toContain('inner loading...')
        // This test case aborts synchronously and the later component render
        // triggers the outer boundary
        expect($('main').text()).toContain('outer loading...')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/sync/server/has_root?sentinel=hello')
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            '`Reflect.has(searchParams, "sentinel"`, `"sentinel" in searchParams`, or similar'
          ),
          expect.stringContaining(
            '`Reflect.has(searchParams, "foo"`, `"foo" in searchParams`, or similar'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should partially prerender pages that checks for the existence of a searchParam property synchronously in a client component', async () => {
      let $ = await next.render$(
        '/search/sync/client/has_boundary?sentinel=hello'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            '`Reflect.has(searchParams, "sentinel"`, `"sentinel" in searchParams`, or similar'
          ),
          expect.stringContaining(
            '`Reflect.has(searchParams, "foo"`, `"foo" in searchParams`, or similar'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at buildtime')
        expect($('main').text()).toContain('inner loading...')
        expect($('main').text()).not.toContain('outer loading...')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/sync/client/has_root?sentinel=hello')
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            '`Reflect.has(searchParams, "sentinel"`, `"sentinel" in searchParams`, or similar'
          ),
          expect.stringContaining(
            '`Reflect.has(searchParams, "foo"`, `"foo" in searchParams`, or similar'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should partially prerender pages that spreads ...searchParam synchronously in a server component', async () => {
      let $ = await next.render$(
        '/search/sync/server/spread_boundary?sentinel=hello&foo=foo&then=bar&value=baz'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'enumerated incompletely with `{...searchParams}`, `Object.keys(searchParams)`, or similar.'
          ),
          expect.stringContaining(
            'accessed directly with `searchParams.sentinel`'
          ),
          expect.stringContaining('accessed directly with `searchParams.foo`'),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at buildtime')
        expect($('main').text()).not.toContain('inner loading...')
        // This test case aborts synchronously and the later component render
        // triggers the outer boundary
        expect($('main').text()).toContain('outer loading...')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$(
        '/search/sync/server/spread_root?sentinel=hello&foo=foo'
      )
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'enumerated with `{...searchParams}`, `Object.keys(searchParams)`, or similar.'
          ),
          expect.stringContaining(
            'accessed directly with `searchParams.sentinel`'
          ),
          expect.stringContaining('accessed directly with `searchParams.foo`'),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should partially prerender pages that spreads ...searchParam synchronously in a client component', async () => {
      let $ = await next.render$(
        '/search/sync/client/spread_boundary?sentinel=hello&foo=foo&then=bar&value=baz'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'enumerated incompletely with `{...searchParams}`, `Object.keys(searchParams)`, or similar.'
          ),
          expect.stringContaining(
            'accessed directly with `searchParams.sentinel`'
          ),
          expect.stringContaining('accessed directly with `searchParams.foo`'),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at buildtime')
        expect($('main').text()).toContain('inner loading...')
        expect($('main').text()).not.toContain('outer loading...')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$(
        '/search/sync/client/spread_root?sentinel=hello&foo=foo'
      )
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'enumerated with `{...searchParams}`, `Object.keys(searchParams)`, or similar.'
          ),
          expect.stringContaining(
            'accessed directly with `searchParams.sentinel`'
          ),
          expect.stringContaining('accessed directly with `searchParams.foo`'),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  } else {
    it('should not prerender a page that accesses a searchParam property synchronously in a server component', async () => {
      let $ = await next.render$(
        '/search/sync/server/access_boundary?sentinel=hello'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'searchParam property was accessed directly with `searchParams.sentinel`'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/sync/server/access_root?sentinel=hello')
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'searchParam property was accessed directly with `searchParams.sentinel`'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should not prerender a page that accesses a searchParam property synchronously in a client component', async () => {
      let $ = await next.render$(
        '/search/sync/client/access_boundary?sentinel=hello'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'searchParam property was accessed directly with `searchParams.sentinel`'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/sync/client/access_root?sentinel=hello')
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'searchParam property was accessed directly with `searchParams.sentinel`'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should not prerender a page that checks for the existence of a searchParam property synchronously in a server component', async () => {
      let $ = await next.render$(
        '/search/sync/server/has_boundary?sentinel=hello'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            '`Reflect.has(searchParams, "sentinel"`, `"sentinel" in searchParams`, or similar.'
          ),
          expect.stringContaining(
            'Reflect.has(searchParams, "foo"`, `"foo" in searchParams`, or similar.'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/sync/server/has_root?sentinel=hello')
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            '`Reflect.has(searchParams, "sentinel"`, `"sentinel" in searchParams`, or similar.'
          ),
          expect.stringContaining(
            'Reflect.has(searchParams, "foo"`, `"foo" in searchParams`, or similar.'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should not prerender a page that checks for the existence of a searchParam property synchronously in a client component', async () => {
      let $ = await next.render$(
        '/search/sync/client/has_boundary?sentinel=hello'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            '`Reflect.has(searchParams, "sentinel"`, `"sentinel" in searchParams`, or similar.'
          ),
          expect.stringContaining(
            'Reflect.has(searchParams, "foo"`, `"foo" in searchParams`, or similar.'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$('/search/sync/client/has_root?sentinel=hello')
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            '`Reflect.has(searchParams, "sentinel"`, `"sentinel" in searchParams`, or similar.'
          ),
          expect.stringContaining(
            'Reflect.has(searchParams, "foo"`, `"foo" in searchParams`, or similar.'
          ),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('#has-sentinel').text()).toBe('true')
        expect($('#has-foo').text()).toBe('false')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should not prerender a page that spreads ...searchParam synchronously in a server component', async () => {
      let $ = await next.render$(
        '/search/sync/server/spread_boundary?sentinel=hello&foo=foo&then=bar&value=baz'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'enumerated incompletely with `{...searchParams}`, `Object.keys(searchParams)`, or similar.'
          ),
          expect.stringContaining(
            'accessed directly with `searchParams.sentinel`'
          ),
          expect.stringContaining('accessed directly with `searchParams.foo`'),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$(
        '/search/sync/server/spread_root?sentinel=hello&foo=foo'
      )
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'enumerated with `{...searchParams}`, `Object.keys(searchParams)`, or similar.'
          ),
          expect.stringContaining(
            'accessed directly with `searchParams.sentinel`'
          ),
          expect.stringContaining('accessed directly with `searchParams.foo`'),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
      }
    })

    it('should not prerender a page that spreads ...searchParam synchronously in a client component', async () => {
      let $ = await next.render$(
        '/search/sync/client/spread_boundary?sentinel=hello&foo=foo&then=bar&value=baz'
      )
      let searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'enumerated incompletely with `{...searchParams}`, `Object.keys(searchParams)`, or similar.'
          ),
          expect.stringContaining(
            'accessed directly with `searchParams.sentinel`'
          ),
          expect.stringContaining('accessed directly with `searchParams.foo`'),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
      }

      $ = await next.render$(
        '/search/sync/client/spread_root?sentinel=hello&foo=foo'
      )
      searchWarnings = getLines('In route /search')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
        expect(searchWarnings).toEqual([
          expect.stringContaining(
            'enumerated with `{...searchParams}`, `Object.keys(searchParams)`, or similar.'
          ),
          expect.stringContaining(
            'accessed directly with `searchParams.sentinel`'
          ),
          expect.stringContaining('accessed directly with `searchParams.foo`'),
        ])
      } else {
        expect(searchWarnings).toHaveLength(0)
        expect($('#layout').text()).toBe('at runtime')
        expect($('[data-value]').length).toBe(2)
        expect($('#value-sentinel').text()).toBe('hello')
        expect($('#value-foo').text()).toBe('foo')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  }
})
