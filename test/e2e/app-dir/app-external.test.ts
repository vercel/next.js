import path from 'path'
import { renderViaHTTP, fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

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
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip for deploy mode for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './app-external')),
      dependencies: {
        '@next/font': 'canary',
        react: 'latest',
        'react-dom': 'latest',
        swr: '2.0.0-rc.0',
      },
      packageJson: {
        scripts: {
          setup: `cp -r ./node_modules_bak/* ./node_modules`,
          build: 'yarn setup && next build',
          dev: 'yarn setup && next dev',
          start: 'next start',
        },
      },
      installCommand: 'yarn',
      startCommand: (global as any).isNextDev ? 'yarn dev' : 'yarn start',
      buildCommand: 'yarn build',
    })
  })
  afterAll(() => next.destroy())

  const { isNextDeploy } = global as any
  const isReact17 = process.env.NEXT_TEST_REACT_VERSION === '^17'
  if (isNextDeploy || isReact17) {
    it('should skip tests for next-deploy and react 17', () => {})
    return
  }

  it('should be able to opt-out 3rd party packages being bundled in server components', async () => {
    await fetchViaHTTP(next.url, '/react-server/optout').then(
      async (response) => {
        const result = await resolveStreamResponse(response)
        expect(result).toContain('Server: index.default')
        expect(result).toContain('Server subpath: subpath.default')
        expect(result).toContain('Client: index.default')
        expect(result).toContain('Client subpath: subpath.default')
      }
    )
  })

  it('should handle external async module libraries correctly', async () => {
    const clientHtml = await renderViaHTTP(next.url, '/external-imports/client')
    const serverHtml = await renderViaHTTP(next.url, '/external-imports/server')
    const sharedHtml = await renderViaHTTP(next.url, '/shared-esm-dep')

    const browser = await webdriver(next.url, '/external-imports/client')
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
    const clientHtml = await renderViaHTTP(next.url, '/external-imports/client')
    expect(clientHtml).toContain('transpilePackages:5')
  })

  it('should resolve the subset react in server components based on the react-server condition', async () => {
    await fetchViaHTTP(next.url, '/react-server').then(async (response) => {
      const result = await resolveStreamResponse(response)
      expect(result).toContain('Server: <!-- -->subset')
      expect(result).toContain('Client: <!-- -->full')
    })
  })

  it('should resolve 3rd party package exports based on the react-server condition', async () => {
    await fetchViaHTTP(next.url, '/react-server/3rd-party-package').then(
      async (response) => {
        const result = await resolveStreamResponse(response)

        // Package should be resolved based on the react-server condition,
        // as well as package's internal & external dependencies.
        expect(result).toContain(
          'Server: index.react-server:react.subset:dep.server'
        )
        expect(result).toContain('Client: index.default:react.full:dep.default')

        // Subpath exports should be resolved based on the condition too.
        expect(result).toContain('Server subpath: subpath.react-server')
        expect(result).toContain('Client subpath: subpath.default')
      }
    )
  })

  it('should correctly collect global css imports and mark them as side effects', async () => {
    await fetchViaHTTP(next.url, '/css/a').then(async (response) => {
      const result = await resolveStreamResponse(response)

      // It should include the global CSS import
      expect(result).toMatch(/\.css/)
    })
  })

  it('should handle external css modules', async () => {
    const browser = await webdriver(next.url, '/css/modules')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('h1')).color`
      )
    ).toBe('rgb(255, 0, 0)')
  })

  it('should use the same export type for packages in both ssr and client', async () => {
    const browser = await webdriver(next.url, '/client-dep')
    expect(await browser.eval(`window.document.body.innerText`)).toBe('hello')
  })

  it('should handle external css modules in pages', async () => {
    const browser = await webdriver(next.url, '/test-pages')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('h1')).color`
      )
    ).toBe('rgb(255, 0, 0)')
  })

  it('should handle external @next/font', async () => {
    const browser = await webdriver(next.url, '/font')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('p')).fontFamily`
      )
    ).toMatch(/^__myFont_.{6}, __myFont_Fallback_.{6}$/)
  })

  describe('react in external esm packages', () => {
    it('should use the same react in client app', async () => {
      const html = await renderViaHTTP(next.url, '/esm/client')

      const v1 = html.match(/App React Version: ([^<]+)</)[1]
      const v2 = html.match(/External React Version: ([^<]+)</)[1]
      expect(v1).toBe(v2)
    })

    it('should use the same react in server app', async () => {
      const html = await renderViaHTTP(next.url, '/esm/server')

      const v1 = html.match(/App React Version: ([^<]+)</)[1]
      const v2 = html.match(/External React Version: ([^<]+)</)[1]
      expect(v1).toBe(v2)
    })

    it('should use the same react in pages', async () => {
      const html = await renderViaHTTP(next.url, '/test-pages-esm')

      const v1 = html.match(/App React Version: ([^<]+)</)[1]
      const v2 = html.match(/External React Version: ([^<]+)</)[1]
      expect(v1).toBe(v2)
    })
  })
})
