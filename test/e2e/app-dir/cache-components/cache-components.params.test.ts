import { nextTestSetup } from 'e2e-utils'

// cSpell:words lowcard highcard
describe('cache-components', () => {
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

    // Since #85155, we intentionally omit search params from client segments
    // if the page is otherwise static, and resume using a client fetch
    // instead. So it's expected that the value is missing pre-hydration.
    // There are separate tests that verify that it is eventually hydrated.
    // TODO: Rewrite or update this test.
    it.skip('should partially prerender pages that use params in a client components', async () => {
      expect(getLines('Route "/params')).toEqual([])

      let $ = await next.render$(
        '/params/semantics/one/build/layout-access/client'
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
        expect(getLines('Route "/params')).toEqual([])
      }

      $ = await next.render$('/params/semantics/one/run/layout-access/client')
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

      $ = await next.render$('/params/semantics/one/build/page-access/client')
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

      $ = await next.render$('/params/semantics/one/run/page-access/client')
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

    // Since #85155, we intentionally omit search params from client segments
    // if the page is otherwise static, and resume using a client fetch
    // instead. So it's expected that the value is missing pre-hydration.
    // There are separate tests that verify that it is eventually hydrated.
    // TODO: Rewrite or update this test.
    it.skip('should fully prerender pages that check individual param keys after `use`ing params in a client component', async () => {
      expect(getLines('Route "/params')).toEqual([])
      let $ = await next.render$(
        '/params/semantics/one/build/layout-has/client'
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

      $ = await next.render$('/params/semantics/one/build/page-has/client')
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

      $ = await next.render$('/params/semantics/one/run/layout-has/client')
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

      $ = await next.render$('/params/semantics/one/run/page-has/client')
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

    // Since #85155, we intentionally omit search params from client segments
    // if the page is otherwise static, and resume using a client fetch
    // instead. So it's expected that the value is missing pre-hydration.
    // There are separate tests that verify that it is eventually hydrated.
    // TODO: Rewrite or update this test.
    it.skip('should partially prerender pages that spread `use`ed params in a client component', async () => {
      expect(getLines('Route "/params')).toEqual([])
      let $ = await next.render$(
        '/params/semantics/one/build/layout-spread/client'
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

      $ = await next.render$('/params/semantics/one/build/page-spread/client')
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

      $ = await next.render$('/params/semantics/one/run/layout-spread/client')
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

      $ = await next.render$('/params/semantics/one/run/page-spread/client')
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

    // Since #85155, we intentionally omit search params from client segments
    // if the page is otherwise static, and resume using a client fetch
    // instead. So it's expected that the value is missing pre-hydration.
    // There are separate tests that verify that it is eventually hydrated.
    // TODO: Rewrite or update this test.
    it.skip('should correctly allow param names like then, value, and status when `use`ing params in a client component', async () => {
      expect(getLines('Route "/params')).toEqual([])
      let $ = await next.render$(
        '/params/shadowing/foo/bar/baz/qux/layout/client'
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

      $ = await next.render$('/params/shadowing/foo/bar/baz/qux/page/client')
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
