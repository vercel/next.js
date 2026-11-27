import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// `import defer` (https://github.com/tc39/proposal-defer-import-eval) is only
// implemented by Turbopack. Every page also defers an import of a module that
// throws when evaluated, and never accesses it.
// @force-gate turbopack
describe('import-defer', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should evaluate deferred imports in server components on access', async () => {
    const $ = await next.render$('/server')
    expect($('#server-value').text()).toBe('server-data')
    expect($('#server-call').text()).toBe('server-data')
    expect($('#server-dynamic').text()).toBe('server-data')
    expect($('#server-never-called').text()).toBe('function')
  })

  it('should render a client component from a deferred import in a server component', async () => {
    const browser = await next.browser('/client-reference')
    expect(await browser.elementByCss('#counter').text()).toBe(
      'deferred client component: 0'
    )
    await retry(async () => {
      await browser.elementByCss('#counter').click()
      expect(await browser.elementByCss('#counter').text()).not.toBe(
        'deferred client component: 0'
      )
    })
  })

  it('should defer the evaluation of imports in client components until accessed', async () => {
    const browser = await next.browser('/client')
    expect(
      await browser.eval('(globalThis.__importDeferLog ?? []).join(",")')
    ).toBe('')

    await browser.elementByCss('#access-static').click()
    await retry(async () => {
      expect(await browser.elementByCss('#static-result').text()).toBe(
        'before:false value:browser-lazy-value after:true'
      )
    })
  })

  it('should load but not evaluate modules with import.defer() in client components', async () => {
    const browser = await next.browser('/client')
    await browser.elementByCss('#access-dynamic').click()
    await retry(async () => {
      expect(await browser.elementByCss('#dynamic-result').text()).toBe(
        'loaded:false value:browser-dynamic-value after:true'
      )
    })
  })

  it('should evaluate deferred imports in server actions on access', async () => {
    const browser = await next.browser('/action')
    await browser.elementByCss('#call-action').click()
    await retry(async () => {
      expect(await browser.elementByCss('#action-result').text()).toBe(
        'server-data'
      )
    })
  })

  if (isNextDev) {
    it('should read updated modules through deferred namespaces after HMR', async () => {
      const browser = await next.browser('/client')
      await browser.elementByCss('#access-namespace').click()
      await browser.elementByCss('#access-dynamic').click()
      await retry(async () => {
        expect(await browser.elementByCss('#namespace-result').text()).toBe(
          'browser-lazy-value'
        )
        expect(await browser.elementByCss('#dynamic-result').text()).toContain(
          'value:browser-dynamic-value'
        )
      })

      await next.patchFile(
        'lib/browser-lazy.ts',
        (content) =>
          String(content).replace(
            "'browser-lazy-value'",
            "'browser-lazy-updated'"
          ),
        async () => {
          await next.patchFile(
            'lib/browser-dynamic.ts',
            (content) =>
              String(content).replace(
                "'browser-dynamic-value'",
                "'browser-dynamic-updated'"
              ),
            async () => {
              await retry(async () => {
                await browser.elementByCss('#access-namespace').click()
                await browser.elementByCss('#access-dynamic').click()
                expect(
                  await browser.elementByCss('#namespace-result').text()
                ).toBe('browser-lazy-updated')
                expect(
                  await browser.elementByCss('#dynamic-result').text()
                ).toContain('value:browser-dynamic-updated')
              })
            }
          )
        }
      )
    })
  }
})
