import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('webpack-loader-inline-requests', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'inline-conditions-loader': 'file:./loaders/condition-package',
      'inline-main-loader': 'file:./loaders/main-package',
      'to-string-loader': '1.2.0',
      'style-loader': '4.0.0',
      'script-loader': '0.7.2',
      'expose-loader': '5.0.1',
      'css-loader': '7.1.2',
      'isomorphic-style-loader': '6.0.0',
      'universal-style-loader': '0.16.3',
      'react-web-component-style-loader': '0.1.4-alpha',
      'css-hot-loader': '1.4.4',
    },
  })

  const expectedRequests = {
    ordinary: 'plain:configured',
    single: 'plain',
    double: 'plain',
    minus: 'plain',
    singleChain: 'plain:inline',
    minusChain: 'plain:inline',
    explicitChain: 'original:inline',
    combined: 'plain:configured:inline',
    absolutePrefix: 'plain',
    resolved: expect.stringMatching(/string|number/),
    distinctQueryIds: true,
    distinctFragmentIds: true,
    distinctPrefixedModule: true,
    packageSource: true,
    packageQuery: {
      options: { label: 'package' },
      query: '?resource',
      fragment: '#fragment',
    },
    packageQueryOnly: { resourceQuery: '?query-only', resourceFragment: '' },
    packageFragmentOnly: {
      resourceQuery: '',
      resourceFragment: '#fragment-only',
    },
    directoryResource: {
      resourceQuery: '?directory',
      resourceFragment: '#fragment',
    },
    distinctPackageQueryIds: true,
    distinctPackageFragmentIds: true,
    optional: 'missing',
    unexportedLoader: 'missing',
    jsonLoader: 'missing',
    packageLoader: {
      entry: 'loader-condition',
      options: { label: 'package-query' },
    },
    requireCondition: { entry: 'loader-condition' },
    nodeCondition: { entry: 'loader-condition' },
    loaderSubpath: { entry: 'loader-condition' },
    loaderMain: 'loader-field',
    loaderExtension: 'loader-field',
    esmLoader: 'esm-loader',
    exportedResources: {
      root: { query: '', fragment: '' },
      rootQuery: 'missing',
      rootFragment: 'missing',
      rootBoth: 'missing',
      subpath: { query: '', fragment: '' },
      subpathQuery: 'missing',
      subpathFragment: 'missing',
      subpathBoth: 'missing',
      explicitQuery: { query: '', fragment: '' },
      explicitFragment: { query: '', fragment: '' },
      explicitBoth: { query: '', fragment: '' },
      wildcard: { query: '', fragment: '' },
      wildcardQuery: { query: '?q=1.cjs', fragment: '' },
      wildcardFragment: { query: '', fragment: '#h.cjs' },
      wildcardBoth: { query: '?q=1', fragment: '#h.cjs' },
      targetQuery: { query: '?from-export', fragment: '' },
      targetFragment: { query: '', fragment: '#exported' },
      targetBoth: { query: '?from-export', fragment: '#exported' },
      blocked: 'missing',
      blockedQuery: 'missing',
      blockedFragment: 'missing',
    },
    url: { options: { label: 'https://cdn.example.test/' } },
    pitch: {
      value: 'original',
      options: { label: '#fff' },
    },
    pitchString: {
      value: 'original',
      options: { label: 'before#after' },
      query: '?label=before#after',
    },
    relative: {
      value: 'original',
      options: { label: 'relative' },
      query: '?label=relative',
      resourceQuery: '?query',
      resourceFragment: '#fragment',
    },
    absolute: {
      value: 'original',
      options: { label: 'absolute' },
      resourceQuery: '?query',
      resourceFragment: '#fragment',
    },
  }

  it('resolves generated ESM, CommonJS, dynamic and absolute requests without reapplying the generator', async () => {
    const $ = await next.render$('/')
    const result = JSON.parse($('#requests').text())
    expect(result).toMatchObject(expectedRequests)
    expect(result.dynamic).toEqual(result.relative)
    expect(result.queryA.options).toEqual({ label: 'a' })
    expect(result.queryB.options).toEqual({ label: 'b' })
    expect(result.json.options).toEqual({ label: 'json', number: 3 })
    expect(result.encoded.options).toEqual({ label: ['a b', 'c'] })
    expect(result.fragmentA.resourceFragment).toBe('#one')
    expect(result.fragmentB.resourceFragment).toBe('#two')
    // webpack treats the hash following a loader query as part of its string options.
    expect(result.loaderFragmentA.options).toEqual({ label: 'same#first' })
    expect(result.loaderFragmentB.options).toEqual({ label: 'same#second' })
  })

  it('runs published loaders and their generated inline requests', async () => {
    const browser = await next.browser('/')
    expect(
      JSON.parse(await browser.elementByCss('#client-requests').text())
    ).toMatchObject(expectedRequests)
    expect(await browser.elementByCss('#css').text()).toContain(
      '.inline-string { color: red; }'
    )
    expect(await browser.elementByCss('#isomorphic-css').text()).toContain(
      '#isomorphic-style { color: rgb(22, 44, 66); }'
    )
    expect(await browser.elementByCss('#hot-css').text()).toContain(
      '.hot-style { color: green; }'
    )
    await retry(async () => {
      expect(
        JSON.parse(await browser.elementByCss('#inline-style').text())
      ).toEqual({
        script: 'executed globally',
        exposed: 'exposed value',
      })
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#inline-style")).color'
        )
      ).toBe('rgb(17, 34, 51)')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#inline-style-other")).color'
        )
      ).toBe('rgb(44, 55, 66)')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#isomorphic-style")).color'
        )
      ).toBe('rgb(22, 44, 66)')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#universal-style")).color'
        )
      ).toBe('rgb(33, 66, 99)')
      expect(await browser.elementByCss('#web-component-css').text()).toContain(
        '.web-component-style { color: purple; }'
      )
    })
  })

  if (isNextDev) {
    it('updates the generated style-loader dependency through its HMR accept request', async () => {
      const browser = await next.browser('/')
      await browser.eval('window.inlineLoaderHmrMarker = true')
      const file = 'fixtures/styles.browser-style'
      const original = await next.readFile(file)
      try {
        await next.patchFile(file, original.replace('17, 34, 51', '51, 34, 17'))
        await retry(async () => {
          expect(
            await browser.eval(
              'getComputedStyle(document.querySelector("#inline-style")).color'
            )
          ).toBe('rgb(51, 34, 17)')
          expect(
            await browser.eval(
              'getComputedStyle(document.querySelector("#inline-style-other")).color'
            )
          ).toBe('rgb(44, 55, 66)')
          expect(await browser.eval('window.inlineLoaderHmrMarker')).toBe(true)
        })
      } finally {
        await next.patchFile(file, original)
      }
    })
  }
})
