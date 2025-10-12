import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, check, getDistDir, retry } from 'next-test-utils'

async function resolveStreamResponse(response: any, onData?: any) {
  let result = ''
  onData = onData || (() => {})
  await new Promise((resolve) => {
    response.body.on('data', (chunk) => {
      result += chunk.toString()
      onData(chunk.toString(), result)
    })

    response.body.on('end', resolve)
  })
  return result
}

describe('app dir - external dependency', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      swr: '2.2.5',
      undici: '6.21.0',
    },
    packageJson: {
      scripts: {
        build: 'next build',
        dev: 'next dev',
        start: 'next start',
      },
    },
    installCommand: 'pnpm i',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    buildCommand: 'pnpm build',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should be able to opt-out 3rd party packages being bundled in server components', async () => {
    await next.fetch('/react-server/optout').then(async (response) => {
      const result = await resolveStreamResponse(response)
      expect(result).toContain('Server: index.default')
      expect(result).toContain('Server subpath: subpath.default')
      expect(result).toContain('Client: index.default')
      expect(result).toContain('Client subpath: subpath.default')
      expect(result).not.toContain('opt-out-react-version: 18.3.0-canary')
    })
  })

  it('should handle external async module libraries correctly', async () => {
    const clientHtml = await next.render('/external-imports/client')
    const serverHtml = await next.render('/external-imports/server')
    const sharedHtml = await next.render('/shared-esm-dep')

    const browser = await next.browser('/external-imports/client')
    const browserClientText = await browser.elementByCss('#content').text()

    function containClientContent(content) {
      expect(content).toContain('module type:esm-export')
      expect(content).toContain('export named:named')
      expect(content).toContain('export value:123')
      expect(content).toContain('export array:4,5,6')
      expect(content).toContain('export object:{x:1}')
      expect(content).toContain('swr-state')
    }

    containClientContent(clientHtml)
    containClientContent(browserClientText)

    // support esm module imports on server side, and indirect imports from shared components
    expect(serverHtml).toContain('pure-esm-module')
    expect(sharedHtml).toContain(
      'node_modules instance from client module pure-esm-module'
    )
  })

  it('should transpile specific external packages with the `transpilePackages` option', async () => {
    const clientHtml = await next.render('/external-imports/client')
    expect(clientHtml).toContain('transpilePackages:5')
  })

  it('should resolve the subset react in server components based on the react-server condition', async () => {
    await next.fetch('/react-server').then(async (response) => {
      const result = await resolveStreamResponse(response)
      expect(result).toContain('Server: <!-- -->subset')
      expect(result).toContain('Client: <!-- -->full')
    })
  })

  it('should resolve 3rd party package exports based on the react-server condition', async () => {
    const $ = await next.render$('/react-server/3rd-party-package')

    const result = $('body').text()

    // Package should be resolved based on the react-server condition,
    // as well as package's internal & external dependencies.
    expect(result).toContain(
      'Server: index.react-server:react.subset:dep.server'
    )
    expect(result).toContain('Client: index.default:react.full:dep.default')

    // Subpath exports should be resolved based on the condition too.
    expect(result).toContain('Server subpath: subpath.react-server')
    expect(result).toContain('Client subpath: subpath.default')

    // Prefer `module` field for isomorphic packages.
    expect($('#main-field').text()).toContain('server-module-field:module')
  })

  it('should correctly collect global css imports and mark them as side effects', async () => {
    await next.fetch('/css/a').then(async (response) => {
      const result = await resolveStreamResponse(response)

      // It should include the global CSS import
      expect(result).toMatch(/\.css/)
    })
  })

  it('should handle external css modules', async () => {
    const browser = await next.browser('/css/modules')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('h1')).color`
      )
    ).toBe('rgb(255, 0, 0)')
  })

  it('should use the same export type for packages in both ssr and client', async () => {
    const browser = await next.browser('/client-dep')
    expect(await browser.eval(`window.document.body.innerText`)).toBe('hello')
  })

  it('should handle external css modules in pages', async () => {
    const browser = await next.browser('/test-pages')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('h1')).color`
      )
    ).toBe('rgb(255, 0, 0)')
  })

  it('should handle external next/font', async () => {
    const browser = await next.browser('/font')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('p')).fontFamily`
      )
    ).toMatch(/^myFont, "myFont Fallback"$/)
  })
  it('should not apply swc optimizer transform for external packages in browser layer in web worker', async () => {
    const browser = await next.browser('/browser')
    expect(await browser.elementByCss('#worker-state').text()).toBe('default')

    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('#worker-state').text()).toBe(
        'worker.js:browser-module/other'
      )
    })
  })

  describe('react in external esm packages', () => {
    it('should use the same react in client app', async () => {
      const html = await next.render('/esm/client')

      const v1 = html.match(/App React Version: ([^<]+)</)[1]
      const v2 = html.match(/External React Version: ([^<]+)</)[1]
      expect(v1).toBe(v2)

      // Should work with both esm and cjs imports
      expect(html).toContain('CJS-ESM Compat package: cjs-esm-compat/index.mjs')
      expect(html).toContain('CJS package: cjs-lib')
      expect(html).toContain(
        'Nested imports: nested-import:esm:cjs-esm-compat/index.mjs'
      )
    })

    it('should use the same react in server app', async () => {
      const html = await next.render('/esm/server')

      const v1 = html.match(/App React Version: ([^<]+)</)[1]
      const v2 = html.match(/External React Version: ([^<]+)</)[1]
      expect(v1).toBe(v2)

      // Should work with both esm and cjs imports
      expect(html).toContain('CJS-ESM Compat package: cjs-esm-compat/index.mjs')
      expect(html).toContain('CJS package: cjs-lib')
    })

    it('should use the same react in edge server app', async () => {
      const html = await next.render('/esm/edge-server')

      const v1 = html.match(/App React Version: ([^<]+)</)[1]
      const v2 = html.match(/External React Version: ([^<]+)</)[1]
      expect(v1).toBe(v2)

      // Should work with both esm and cjs imports
      expect(html).toContain('CJS-ESM Compat package: cjs-esm-compat/index.mjs')
      expect(html).toContain('CJS package: cjs-lib')
    })

    it('should use the same react in pages', async () => {
      const html = await next.render('/test-pages-esm')

      const v1 = html.match(/App React Version: ([^<]+)</)[1]
      const v2 = html.match(/External React Version: ([^<]+)</)[1]
      expect(v1).toBe(v2)
    })

    it('should support namespace import with ESM packages', async () => {
      const $ = await next.render$('/esm/react-namespace-import')
      expect($('#namespace-import-esm').text()).toBe('namespace-import:esm')
    })

    it('should apply serverExternalPackages inside of node_modules', async () => {
      const html = await next.render('/transitive-external')
      expect(html).toContain('transitive loaded a')
    })
  })

  describe('mixed syntax external modules', () => {
    it('should handle mixed module with next/dynamic', async () => {
      const browser = await next.browser('/mixed/dynamic')
      expect(await browser.elementByCss('#component').text()).toContain(
        'mixed-syntax-esm'
      )
    })

    it('should handle mixed module in server and client components', async () => {
      const $ = await next.render$('/mixed/import')
      expect(await $('#server').text()).toContain('server:mixed-syntax-esm')
      expect(await $('#client').text()).toContain('client:mixed-syntax-esm')
      expect(await $('#relative-mixed').text()).toContain(
        'relative-mixed-syntax-esm'
      )
    })
  })

  it('should emit cjs helpers for external cjs modules when compiled', async () => {
    const $ = await next.render$('/cjs/client')
    expect($('#private-prop').text()).toBe('prop')
    expect($('#transpile-cjs-lib').text()).toBe('transpile-cjs-lib')

    const browser = await next.browser('/cjs/client')
    await assertNoRedbox(browser)
  })

  it('should export client module references in esm', async () => {
    const html = await next.render('/esm-client-ref')
    expect(html).toContain('hello')
  })

  it('should support client module references with SSR-only ESM externals', async () => {
    const html = await next.render('/esm-client-ref-external')
    expect(html).toContain('client external-pure-esm-lib')
  })

  it('should support exporting multiple star re-exports', async () => {
    const html = await next.render('/wildcard')
    expect(html).toContain('Foo')
  })

  it('should have proper tree-shaking for known modules in CJS', async () => {
    const html = await next.render('/cjs/server')
    expect(html).toContain('resolve response')

    const outputFile = await next.readFile(
      `${getDistDir()}/server/app/cjs/server/page.js`
    )
    expect(outputFile).not.toContain('image-response')
  })

  it('should use the same async storages if imported directly', async () => {
    const html = await next.render('/async-storage')
    expect(html).toContain('success')
  })

  describe('server actions', () => {
    it('should prefer to resolve esm over cjs for bundling optout packages', async () => {
      const browser = await next.browser('/optout/action')
      expect(await browser.elementByCss('#dual-pkg-outout p').text()).toBe(
        'initial'
      )

      browser.elementByCss('#dual-pkg-outout button').click()
      await check(async () => {
        const text = await browser.elementByCss('#dual-pkg-outout p').text()
        expect(text).toBe('dual-pkg-optout:mjs')
        return 'success'
      }, /success/)
    })

    it('should compile server actions from node_modules in client components', async () => {
      // before action there's no action log
      expect(next.cliOutput).not.toContain('action-log:server:action1')
      const browser = await next.browser('/action/client')
      await browser.elementByCss('#action').click()

      await check(() => {
        expect(next.cliOutput).toContain('action-log:server:action1')
        return 'success'
      }, /success/)
    })
  })

  describe('app route', () => {
    it('should resolve next/server api from external esm package', async () => {
      const res = await next.fetch('/app-routes')
      const text = await res.text()
      expect(res.status).toBe(200)
      expect(text).toBe('get route')
    })
  })
})
