import { nextTestSetup } from 'e2e-utils'
import { assertNoConsoleErrors, retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// cSpell:words lowcard highcard
describe('cache-components', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
  })

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

  // A prerendered param renders the client segments into the HTML, so these
  // read the HTML. (Their `getSentinelValue()` differs between the build and
  // the browser, so hydrating those pages reports a text mismatch.)
  async function expectRenderedText(
    url: string,
    expected: Record<string, string>
  ) {
    const $ = await next.render$(url)
    const actual = Object.fromEntries(
      Object.keys(expected).map((id) => [id, $(`#${id}`).text()])
    )
    expect(actual).toEqual(expected)
  }

  // A param that wasn't prerendered is served the static fallback shell. Its
  // client segments get their params from the URL once the page has hydrated
  // (#84883), after the shell has fetched the page's hydration data (`/_full`),
  // so these read the hydrated page.
  async function expectHydratedText(
    url: string,
    expected: Record<string, string>
  ) {
    const fullPayloadRequests: string[] = []
    const browser = await next.browser(url, {
      pushErrorAsConsoleLog: true,
      beforePageLoad(page: Playwright.Page) {
        page.on('request', (request) => {
          if (request.headers()['next-router-segment-prefetch'] === '/_full') {
            fullPayloadRequests.push(new URL(request.url()).pathname)
          }
        })
      },
    })
    await retry(async () => {
      const actual = await browser.eval(
        (ids: string[]) =>
          Object.fromEntries(
            ids.map((id) => [id, document.getElementById(id)?.textContent])
          ),
        Object.keys(expected)
      )
      expect(actual).toEqual(expected)
    })
    if (!isNextDev) {
      await assertNoConsoleErrors(browser)
    }
    if (isNextStart) {
      expect(fullPayloadRequests).toEqual([url])
    }
    await browser.close()
  }

  describe('Params', () => {
    it('should partially prerender pages that await params in a server components', async () => {
      expect(getLines('Route "/params')).toEqual([])

      let $ = await next.render$(
        '/params/semantics/one/build/layout-access/server'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')

        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-lowcard').text()).toBe('one')
        expect($('#param-highcard').text()).toBe('build')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#param-lowcard').text()).toBe('one')
        expect($('#param-highcard').text()).toBe('build')
      }

      $ = await next.render$('/params/semantics/one/run/layout-access/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')

        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-lowcard').text()).toBe('one')
        expect($('#param-highcard').text()).toBe('run')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#highcard-fallback').text()).toBe('loading highcard children')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-lowcard').text()).toBe('one')
        expect($('#param-highcard').text()).toBe('run')
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/semantics/one/build/page-access/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')

        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-lowcard').text()).toBe('one')
        expect($('#param-highcard').text()).toBe('build')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#param-lowcard').text()).toBe('one')
        expect($('#param-highcard').text()).toBe('build')
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/semantics/one/run/page-access/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')

        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-lowcard').text()).toBe('one')
        expect($('#param-highcard').text()).toBe('run')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#highcard-fallback').text()).toBe('loading highcard children')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-lowcard').text()).toBe('one')
        expect($('#param-highcard').text()).toBe('run')
        expect(getLines('Route "/params')).toEqual([])
      }
    })

    it('should partially prerender pages that use params in a client components', async () => {
      expect(getLines('Route "/params')).toEqual([])
      const sentinel = isNextDev ? 'at runtime' : 'at buildtime'
      for (const access of ['layout-access', 'page-access']) {
        await expectRenderedText(
          `/params/semantics/one/build/${access}/client`,
          {
            layout: sentinel,
            lowcard: sentinel,
            highcard: sentinel,
            page: sentinel,
            'param-lowcard': 'one',
            'param-highcard': 'build',
          }
        )
        await expectHydratedText(`/params/semantics/one/run/${access}/client`, {
          layout: sentinel,
          lowcard: sentinel,
          highcard: sentinel,
          page: 'at runtime',
          'param-lowcard': 'one',
          'param-highcard': 'run',
        })
      }
      expect(getLines('Route "/params')).toEqual([])
    })

    it('should fully prerender pages that check individual param keys after awaiting params in a server component', async () => {
      expect(getLines('Route "/params')).toEqual([])
      let $ = await next.render$(
        '/params/semantics/one/build/layout-has/server'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-has-lowcard').text()).toBe('true')
        expect($('#param-has-highcard').text()).toBe('true')
        expect($('#param-has-foo').text()).toBe('false')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#param-has-lowcard').text()).toBe('true')
        expect($('#param-has-highcard').text()).toBe('true')
        expect($('#param-has-foo').text()).toBe('false')
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/semantics/one/build/page-has/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-has-lowcard').text()).toBe('true')
        expect($('#param-has-highcard').text()).toBe('true')
        expect($('#param-has-foo').text()).toBe('false')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#param-has-lowcard').text()).toBe('true')
        expect($('#param-has-highcard').text()).toBe('true')
        expect($('#param-has-foo').text()).toBe('false')
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/semantics/one/run/layout-has/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-has-lowcard').text()).toBe('true')
        expect($('#param-has-highcard').text()).toBe('true')
        expect($('#param-has-foo').text()).toBe('false')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        // With PPR fallbacks the first visit is still partially prerendered
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#highcard-fallback').text()).toBe('loading highcard children')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-has-lowcard').text()).toBe('true')
        expect($('#param-has-highcard').text()).toBe('true')
        expect($('#param-has-foo').text()).toBe('false')
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/semantics/one/run/page-has/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-has-lowcard').text()).toBe('true')
        expect($('#param-has-highcard').text()).toBe('true')
        expect($('#param-has-foo').text()).toBe('false')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        // With PPR fallbacks the first visit is still partially prerendered
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#highcard-fallback').text()).toBe('loading highcard children')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-has-lowcard').text()).toBe('true')
        expect($('#param-has-highcard').text()).toBe('true')
        expect($('#param-has-foo').text()).toBe('false')
        expect(getLines('Route "/params')).toEqual([])
      }
    })

    it('should fully prerender pages that check individual param keys after `use`ing params in a client component', async () => {
      expect(getLines('Route "/params')).toEqual([])
      const sentinel = isNextDev ? 'at runtime' : 'at buildtime'
      for (const access of ['layout-has', 'page-has']) {
        await expectRenderedText(
          `/params/semantics/one/build/${access}/client`,
          {
            layout: sentinel,
            lowcard: sentinel,
            highcard: sentinel,
            page: sentinel,
            'param-has-lowcard': 'true',
            'param-has-highcard': 'true',
            'param-has-foo': 'false',
          }
        )
        await expectHydratedText(`/params/semantics/one/run/${access}/client`, {
          layout: sentinel,
          lowcard: sentinel,
          highcard: sentinel,
          page: 'at runtime',
          'param-has-lowcard': 'true',
          'param-has-highcard': 'true',
          'param-has-foo': 'false',
        })
      }
      expect(getLines('Route "/params')).toEqual([])
    })

    it('should partially prerender pages that spread awaited params in a server component', async () => {
      expect(getLines('Route "/params')).toEqual([])
      let $ = await next.render$(
        '/params/semantics/one/build/layout-spread/server'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-copied-lowcard').text()).toBe('one')
        expect($('#param-copied-highcard').text()).toBe('build')
        expect($('#param-key-count').text()).toBe('2')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#param-copied-lowcard').text()).toBe('one')
        expect($('#param-copied-highcard').text()).toBe('build')
        expect($('#param-key-count').text()).toBe('2')
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/semantics/one/build/page-spread/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-copied-lowcard').text()).toBe('one')
        expect($('#param-copied-highcard').text()).toBe('build')
        expect($('#param-key-count').text()).toBe('2')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#param-copied-lowcard').text()).toBe('one')
        expect($('#param-copied-highcard').text()).toBe('build')
        expect($('#param-key-count').text()).toBe('2')
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/semantics/one/run/layout-spread/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-copied-lowcard').text()).toBe('one')
        expect($('#param-copied-highcard').text()).toBe('run')
        expect($('#param-key-count').text()).toBe('2')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#highcard-fallback').text()).toBe('loading highcard children')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-copied-lowcard').text()).toBe('one')
        expect($('#param-copied-highcard').text()).toBe('run')
        expect($('#param-key-count').text()).toBe('2')
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/semantics/one/run/page-spread/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#lowcard').text()).toBe('at runtime')
        expect($('#highcard').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-copied-lowcard').text()).toBe('one')
        expect($('#param-copied-highcard').text()).toBe('run')
        expect($('#param-key-count').text()).toBe('2')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#lowcard').text()).toBe('at buildtime')
        expect($('#highcard').text()).toBe('at buildtime')
        expect($('#highcard-fallback').text()).toBe('loading highcard children')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-copied-lowcard').text()).toBe('one')
        expect($('#param-copied-highcard').text()).toBe('run')
        expect($('#param-key-count').text()).toBe('2')
        expect(getLines('Route "/params')).toEqual([])
      }
    })

    it('should partially prerender pages that spread `use`ed params in a client component', async () => {
      expect(getLines('Route "/params')).toEqual([])
      const sentinel = isNextDev ? 'at runtime' : 'at buildtime'
      for (const access of ['layout-spread', 'page-spread']) {
        await expectRenderedText(
          `/params/semantics/one/build/${access}/client`,
          {
            layout: sentinel,
            lowcard: sentinel,
            highcard: sentinel,
            page: sentinel,
            'param-copied-lowcard': 'one',
            'param-copied-highcard': 'build',
            'param-key-count': '2',
          }
        )
        await expectHydratedText(`/params/semantics/one/run/${access}/client`, {
          layout: sentinel,
          lowcard: sentinel,
          highcard: sentinel,
          page: 'at runtime',
          'param-copied-lowcard': 'one',
          'param-copied-highcard': 'run',
          'param-key-count': '2',
        })
      }
      expect(getLines('Route "/params')).toEqual([])
    })
  })

  describe('Param Shadowing', () => {
    it('should correctly allow param names like then, value, and status when awaiting params in a server component', async () => {
      expect(getLines('Route "/params')).toEqual([])
      let $ = await next.render$(
        '/params/shadowing/foo/bar/baz/qux/layout/server'
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-dyn').text()).toBe('foo')
        expect($('#param-then').text()).toBe('bar')
        expect($('#param-value').text()).toBe('baz')
        expect($('#param-status').text()).toBe('qux')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-dyn').text()).toBe('foo')
        expect($('#param-then').text()).toBe('bar')
        expect($('#param-value').text()).toBe('baz')
        expect($('#param-status').text()).toBe('qux')
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/shadowing/foo/bar/baz/qux/page/server')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-dyn').text()).toBe('foo')
        expect($('#param-then').text()).toBe('bar')
        expect($('#param-value').text()).toBe('baz')
        expect($('#param-status').text()).toBe('qux')
        expect(getLines('Route "/params')).toEqual([])
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#param-dyn').text()).toBe('foo')
        expect($('#param-then').text()).toBe('bar')
        expect($('#param-value').text()).toBe('baz')
        expect($('#param-status').text()).toBe('qux')
        expect(getLines('Route "/params')).toEqual([])
      }
    })

    it('should correctly allow param names like then, value, and status when `use`ing params in a client component', async () => {
      expect(getLines('Route "/params')).toEqual([])
      for (const segment of ['layout', 'page']) {
        await expectHydratedText(
          `/params/shadowing/foo/bar/baz/qux/${segment}/client`,
          {
            layout: isNextDev ? 'at runtime' : 'at buildtime',
            page: 'at runtime',
            'param-dyn': 'foo',
            'param-then': 'bar',
            'param-value': 'baz',
            'param-status': 'qux',
          }
        )
      }
      expect(getLines('Route "/params')).toEqual([])
    })
  })

  if (!isNextDev) {
    describe('generateStaticParams', () => {
      // This test is skipped as the previous workaround of using `fetch-cache` will no longer be supported with DIO.
      it.skip('should have cacheComponents semantics inside generateStaticParams', async () => {
        // This test is named what we want but our current implementation is not actually correct yet.
        // We are asserting current behavior and will update the test when we land the correct behavior

        const lines: Array<string> = next.cliOutput.split('\n')
        let i = 0
        while (true) {
          const line = lines[i++]
          if (typeof line !== 'string') {
            throw new Error(
              'Could not find expected route output for /params/generate-static-params/[slug]/page/...'
            )
          }

          if (
            line.startsWith('├') &&
            line.includes('/params/generate-static-params/[slug]')
          ) {
            let nextLine = lines[i++]
            // we expect the fallback shell first
            expect(nextLine).toContain('/params/generate-static-params/[slug]')
            nextLine = lines[i++]

            expect(nextLine).toMatch(
              /\/params\/generate-static-params\/\d+\/page/
            )
            nextLine = lines[i++]
            // Because we force-cache we only end up with one prebuilt page.
            // When cacheComponents semantics are fully respected we will end up with two.
            expect(nextLine).not.toMatch(
              /\/params\/generate-static-params\/\d+\/page/
            )
            break
          }
        }
      })
    })
  }
})
