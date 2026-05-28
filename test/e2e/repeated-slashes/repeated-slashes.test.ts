import path from 'path'
import escapeRegex from 'escape-string-regexp'
import {
  waitFor,
  stopApp,
  startStaticServer,
  fetchViaHTTP,
  retry,
} from 'next-test-utils'
import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'

function runTests({
  next,
  isDev = false,
  isExport = false,
  isPages404 = false,
  getPort,
}: {
  next: any
  isDev?: boolean
  isExport?: boolean
  isPages404?: boolean
  getPort?: () => number
}) {
  let notFoundContent = 'custom error'

  if (isPages404) {
    notFoundContent = 'custom 404'
  }
  if (isExport && isPages404) {
    notFoundContent = 'custom 404'
  }

  const didNotReload = async (browser) => {
    for (let i = 0; i < 4; i++) {
      await waitFor(500)

      const result = await browser.eval('window.errorLoad')

      if (result !== true) {
        throw new Error(
          `did not find window.errorLoad, current url: ${await browser.url()}`
        )
      }

      if (isDev) break
    }
  }

  // Always resolve to a numeric port. We cannot use `next.fetch(...)` for
  // URLs that start with `//` or contain `\\` because `next.fetch` internally
  // runs them through `new URL(path, baseUrl)`, which normalizes them as
  // protocol-relative URLs (e.g. `//google.com` becomes `http://google.com/`).
  // `fetchViaHTTP` with a numeric port concatenates the path onto the origin
  // verbatim, preserving the repeated-slash/backslash behavior under test.
  const resolvePort = () => (getPort ? getPort() : Number(next.appPort))
  const openBrowser = (url: string, baseUrl: number = resolvePort()) =>
    next.browser(url, { baseUrl })

  if (!isExport) {
    it('should normalize repeated slashes in redirects correctly', async () => {
      const res = await fetchViaHTTP(
        resolvePort(),
        '/redirect-forward-slashes',
        undefined,
        { redirect: 'manual' }
      )

      expect(res.status).toBe(307)
      const parsedUrl = new URL(res.headers.get('location'))

      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(parsedUrl.pathname).toBe('/test/google.com')
      expect(Object.fromEntries(parsedUrl.searchParams.entries())).toEqual({})
      expect(await res.text()).toBe('/test/google.com')

      const res2 = await fetchViaHTTP(
        resolvePort(),
        '/redirect-back-slashes',
        undefined,
        { redirect: 'manual' }
      )

      expect(res2.status).toBe(307)
      const parsedUrl2 = new URL(res2.headers.get('location'))

      expect(parsedUrl2.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(parsedUrl2.pathname).toBe('/test/google.com')
      expect(Object.fromEntries(parsedUrl2.searchParams.entries())).toEqual({})
      expect(await res2.text()).toBe('/test/google.com')
    })
  }

  it('should handle double slashes correctly', async () => {
    const port = resolvePort()
    if (!isExport) {
      const res = await fetchViaHTTP(port, '//google.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)

      const parsedUrl = new URL(res.headers.get('location'))
      expect(parsedUrl.pathname).toBe('/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(Object.fromEntries(parsedUrl.searchParams.entries())).toEqual({})
    }

    const browser = await openBrowser('//google.com', port)
    await didNotReload(browser)
    expect(await browser.eval('window.location.pathname')).toBe(
      isExport ? '//google.com' : '/google.com'
    )
    expect(await browser.eval('window.location.search')).toBe('')
    expect(await browser.eval('window.location.hash')).toBe('')
    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      notFoundContent
    )
  })

  it('should handle double slashes correctly with query', async () => {
    const port = resolvePort()
    if (!isExport) {
      const res = await fetchViaHTTP(
        port,
        '//google.com',
        { h: '1' },
        { redirect: 'manual' }
      )
      expect(res.status).toBe(308)
      const parsedUrl = new URL(res.headers.get('location'))
      expect(parsedUrl.pathname).toBe('/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(Object.fromEntries(parsedUrl.searchParams.entries())).toEqual({
        h: '1',
      })
    }

    const browser = await openBrowser('//google.com?h=1', port)
    await didNotReload(browser)
    expect(await browser.eval('window.location.pathname')).toBe(
      isExport ? '//google.com' : '/google.com'
    )
    expect(await browser.eval('window.location.search')).toBe('?h=1')
    expect(await browser.eval('window.location.hash')).toBe('')
    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      notFoundContent
    )
  })

  it('should handle double slashes correctly with hash', async () => {
    const port = resolvePort()
    if (!isExport) {
      const res = await fetchViaHTTP(port, '//google.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)
      const parsedUrl = new URL(res.headers.get('location'))
      expect(parsedUrl.pathname).toBe('/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(Object.fromEntries(parsedUrl.searchParams.entries())).toEqual({})
    }

    const browser = await openBrowser('//google.com#hello', port)
    await didNotReload(browser)
    expect(await browser.eval('window.location.pathname')).toBe(
      isExport ? '//google.com' : '/google.com'
    )
    expect(await browser.eval('window.location.hash')).toBe('#hello')
    expect(await browser.eval('window.location.search')).toBe('')
    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      notFoundContent
    )
  })

  it('should handle double slashes correctly with encoded', async () => {
    const port = resolvePort()
    if (!isExport) {
      const res = await fetchViaHTTP(port, '/%2Fgoogle.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(404)
      expect(await res.text()).toContain(notFoundContent)
    }

    const browser = await openBrowser('/%2Fgoogle.com', port)
    await didNotReload(browser)
    expect(await browser.eval('window.location.pathname')).toBe(
      '/%2Fgoogle.com'
    )
    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      notFoundContent
    )
  })

  it('should handle double slashes correctly with encoded and query', async () => {
    const port = resolvePort()
    if (!isExport) {
      const res = await fetchViaHTTP(
        port,
        '/%2Fgoogle.com',
        { hello: '1' },
        { redirect: 'manual' }
      )
      expect(res.status).toBe(404)
      expect(await res.text()).toContain(notFoundContent)
    }

    const browser = await openBrowser('/%2Fgoogle.com?hello=1', port)
    await didNotReload(browser)
    expect(await browser.eval('window.location.pathname')).toBe(
      '/%2Fgoogle.com'
    )
    expect(await browser.eval('window.location.search')).toBe('?hello=1')
    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      notFoundContent
    )
  })

  it('should handle double slashes correctly with encoded and hash', async () => {
    const port = resolvePort()
    if (!isExport) {
      const res = await fetchViaHTTP(port, '/%2Fgoogle.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(404)
      expect(await res.text()).toContain(notFoundContent)
    }

    const browser = await openBrowser('/%2Fgoogle.com#hello', port)
    await didNotReload(browser)
    expect(await browser.eval('window.location.pathname')).toBe(
      '/%2Fgoogle.com'
    )
    expect(await browser.eval('window.location.hash')).toBe('#hello')
    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      notFoundContent
    )
  })

  it('should handle backslashes correctly', async () => {
    const port = resolvePort()
    if (!isExport) {
      const res = await fetchViaHTTP(port, '/\\google.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)
      const parsedUrl = new URL(res.headers.get('location'))
      expect(parsedUrl.pathname).toBe('/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(Object.fromEntries(parsedUrl.searchParams.entries())).toEqual({})
      expect(await res.text()).toBe('/google.com')
    }

    const browser = await openBrowser('/\\google.com', port)
    await didNotReload(browser)
    expect(await browser.eval('window.location.pathname')).toBe(
      isExport ? '//google.com' : '/google.com'
    )
    expect(await browser.eval('window.location.hash')).toBe('')
    expect(await browser.eval('window.location.search')).toBe('')
    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      notFoundContent
    )
  })

  it('should handle mixed backslashes/forward slashes correctly', async () => {
    const port = resolvePort()
    if (!isExport) {
      const res = await fetchViaHTTP(port, '/\\/google.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)
      const parsedUrl = new URL(res.headers.get('location'))
      expect(parsedUrl.pathname).toBe(isExport ? '//google.com' : '/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(Object.fromEntries(parsedUrl.searchParams.entries())).toEqual({})
      expect(await res.text()).toBe('/google.com')
    }

    const browser = await openBrowser('/\\/google.com#hello', port)
    await didNotReload(browser)
    expect(await browser.eval('window.location.pathname')).toBe(
      isExport ? '///google.com' : '/google.com'
    )
    expect(await browser.eval('window.location.hash')).toBe('#hello')
    expect(await browser.eval('window.location.search')).toBe('')
    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      notFoundContent
    )
  })

  it('should handle slashes in next/link correctly', async () => {
    const port = resolvePort()
    const browser = await openBrowser(
      `/invalid${isExport ? '.html' : ''}`,
      port
    )
    const invalidHrefs = [
      '//google.com',
      '//google.com?hello=1',
      '//google.com#hello',
      '\\/\\/google.com',
      '\\/\\/google.com?hello=1',
      '\\/\\/google.com#hello',
    ]

    for (const href of invalidHrefs) {
      await retry(async () => {
        const errors = await browser.eval(
          'window.caughtErrors.map(err => typeof err !== "string" ? err.message : err).join(", ")'
        )
        expect(errors).toMatch(
          new RegExp(escapeRegex(`Invalid href '${href}'`))
        )
      })
    }
  })

  it('should handle slashes in router push correctly', async () => {
    for (const item of [
      {
        page: '/another',
        href: '/another',
        as: '//google.com',
        pathname: '/google.com',
      },
      {
        page: isPages404 ? '/404' : '/_error',
        href: '//google.com',
        pathname: '/google.com',
      },
      {
        page: isPages404 ? '/404' : '/_error',
        href: '//google.com?hello=1',
        pathname: '/google.com',
        search: '?hello=1',
      },
      {
        page: isPages404 ? '/404' : '/_error',
        href: '//google.com#hello',
        pathname: '/google.com',
        hash: '#hello',
      },
    ]) {
      const browser = await openBrowser('/')
      await browser.eval(
        `window.next.router.push("${item.href}"${
          item.as ? `, "${item.as}"` : ''
        })`
      )
      await retry(async () => {
        const readyState = await browser.eval('document.readyState')
        expect(readyState).toMatch(/interactive|complete/)
      })
      expect(await browser.eval('window.location.pathname')).toBe(item.pathname)
      expect(await browser.eval('window.location.search')).toBe(
        item.search || ''
      )
      expect(await browser.eval('window.location.hash')).toBe(item.hash || '')
      expect(await browser.eval('window.next.router.pathname')).toBe(item.page)
    }
  })

  it('should have no error from encoded slashes in router push', async () => {
    for (const item of [
      {
        page: '/another',
        href: '/another',
        as: '/%2Fgoogle.com',
        shouldHardNav: false,
      },
      {
        page: isPages404 ? '/404' : '/_error',
        href: '/%2Fgoogle.com',
      },
      {
        page: isPages404 ? '/404' : '/_error',
        href: '/%2F%2Fgoogle.com?hello=1',
        pathname: '/%2F%2Fgoogle.com',
        search: '?hello=1',
      },
      {
        page: isPages404 ? '/404' : '/_error',
        href: '/%5C%5C%2Fgoogle.com#hello',
        pathname: '/%5C%5C%2Fgoogle.com',
        hash: '#hello',
      },
    ]) {
      const browser = await openBrowser('/')
      await browser.eval(`(function() {
        window.beforeNav = 1
        window.next.router.push("${item.href}"${
          item.as ? `, "${item.as}"` : ''
        })
      })()`)

      await retry(async () => {
        const pathname = await browser.eval('window.location.pathname')
        expect(pathname).toBe(item.pathname || item.as || item.href)
      })

      expect(await browser.eval('window.location.search')).toBe(
        item.search || ''
      )
      expect(await browser.eval('window.location.hash')).toBe(item.hash || '')
      expect(await browser.eval('window.next.router.pathname')).toBe(item.page)
      expect(await browser.eval('window.next.router.asPath')).toBe(
        item.as || item.href
      )
      if (item.shouldHardNav !== false) {
        expect(await browser.eval('window.beforeNav')).toBeFalsy()
      } else {
        expect(await browser.eval('window.beforeNav')).toBe(1)
      }
    }
  })
}

describe('404 handling', () => {
  describe('custom _error', () => {
    describe('server mode', () => {
      const { next, isNextDeploy } = nextTestSetup({
        files: path.join(__dirname, 'app'),
        skipDeployment: true,
      })
      if (isNextDeploy) return

      runTests({ next, isDev: isNextDev, isPages404: false })
    })
    ;(isNextStart ? describe : describe.skip)('export mode', () => {
      const { next, skipped } = nextTestSetup({
        files: path.join(__dirname, 'app'),
        skipStart: true,
        skipDeployment: true,
      })
      if (skipped) return

      let staticServer: any
      let staticPort: number

      beforeAll(async () => {
        if (isNextDev) return

        await next.patchFile(
          'next.config.js',
          `module.exports = { output: 'export' }`
        )
        await next.build()
        staticServer = await startStaticServer(
          path.join(next.testDir, 'out'),
          path.join(next.testDir, 'out/404.html')
        )
        staticPort = staticServer.address().port
      })
      afterAll(async () => {
        if (staticServer) await stopApp(staticServer)
      })

      if (isNextDev) {
        it('no-op in dev', () => {})
        return
      }

      runTests({
        next,
        isExport: true,
        isPages404: false,
        getPort: () => staticPort,
      })
    })
  })

  describe('pages/404', () => {
    describe('server mode', () => {
      const { next, skipped } = nextTestSetup({
        files: path.join(__dirname, 'app'),
        skipStart: true,
        skipDeployment: true,
      })
      if (skipped) return

      beforeAll(async () => {
        await next.deleteFile('pages/_error.js')
        await next.patchFile(
          'pages/404.js',
          `
          if (typeof window !== 'undefined') {
            window.errorLoad = true
          }
          export default function Page() {
            return <p id='error'>custom 404</p>
          }
        `
        )

        if (!isNextDev) {
          await next.build()
        }
        await next.start()
      })

      runTests({ next, isDev: isNextDev, isPages404: true })
    })
    ;(isNextStart ? describe : describe.skip)('pages/404 export mode', () => {
      const { next, skipped } = nextTestSetup({
        files: path.join(__dirname, 'app'),
        skipStart: true,
        skipDeployment: true,
      })
      if (skipped) return

      let staticServer: any
      let staticPort: number

      beforeAll(async () => {
        if (isNextDev) return

        await next.deleteFile('pages/_error.js')
        await next.patchFile(
          'pages/404.js',
          `
            if (typeof window !== 'undefined') {
              window.errorLoad = true
            }
            export default function Page() {
              return <p id='error'>custom 404</p>
            }
          `
        )
        await next.patchFile(
          'next.config.js',
          `module.exports = { output: 'export' }`
        )
        await next.build()
        staticServer = await startStaticServer(
          path.join(next.testDir, 'out'),
          path.join(next.testDir, 'out/404.html')
        )
        staticPort = staticServer.address().port
      })
      afterAll(async () => {
        if (staticServer) await stopApp(staticServer)
      })

      if (isNextDev) {
        it('no-op in dev', () => {})
        return
      }

      runTests({
        next,
        isExport: true,
        isPages404: true,
        getPort: () => staticPort,
      })
    })
  })
})
