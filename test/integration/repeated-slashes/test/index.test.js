/* eslint-env jest */
import { join } from 'path'
import fs from 'fs-extra'
import url from 'url'
import webdriver from 'next-webdriver'
import escapeRegex from 'escape-string-regexp'
import {
  nextBuild,
  File,
  findPort,
  nextStart,
  killApp,
  waitFor,
  stopApp,
  startStaticServer,
  launchApp,
  fetchViaHTTP,
  check,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../app')
const outdir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))
let appPort
let app

function runTests({ isDev = false, isExport = false, isPages404 = false }) {
  let notFoundContent = 'custom error'
  // let badRequestContent = 'custom error'

  if (isPages404) {
    // badRequestContent = 'Bad Request'
    notFoundContent = 'custom 404'
  }
  if (isExport && isPages404) {
    notFoundContent = 'custom 404'
    // badRequestContent = 'custom 404'
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

  if (!isExport) {
    it('should normalize repeated slashes in redirects correctly', async () => {
      const res = await fetchViaHTTP(
        appPort,
        '/redirect-forward-slashes',
        undefined,
        {
          redirect: 'manual',
        }
      )

      expect(res.status).toBe(307)
      const parsedUrl = url.parse(res.headers.get('location'), true)

      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(parsedUrl.pathname).toBe('/test/google.com')
      expect(parsedUrl.query).toEqual({})
      expect(await res.text()).toBe('/test/google.com')

      const res2 = await fetchViaHTTP(
        appPort,
        '/redirect-back-slashes',
        undefined,
        {
          redirect: 'manual',
        }
      )

      expect(res2.status).toBe(307)
      const parsedUrl2 = url.parse(res2.headers.get('location'), true)

      expect(parsedUrl2.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(parsedUrl2.pathname).toBe('/test/google.com')
      expect(parsedUrl2.query).toEqual({})
      expect(await res2.text()).toBe('/test/google.com')
    })
  }

  it('should handle double slashes correctly', async () => {
    if (!isExport) {
      const res = await fetchViaHTTP(appPort, '//google.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)

      const parsedUrl = url.parse(res.headers.get('location'), true)
      expect(parsedUrl.pathname).toBe('/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(parsedUrl.query).toEqual({})
    }

    const browser = await webdriver(appPort, '//google.com')
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
    if (!isExport) {
      const res = await fetchViaHTTP(
        appPort,
        '//google.com',
        { h: '1' },
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(308)
      const parsedUrl = url.parse(res.headers.get('location'), true)
      expect(parsedUrl.pathname).toBe('/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(parsedUrl.query).toEqual({ h: '1' })
    }

    const browser = await webdriver(appPort, '//google.com?h=1')
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
    if (!isExport) {
      const res = await fetchViaHTTP(appPort, '//google.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)
      const parsedUrl = url.parse(res.headers.get('location'), true)
      expect(parsedUrl.pathname).toBe('/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(parsedUrl.query).toEqual({})
    }

    const browser = await webdriver(appPort, '//google.com#hello')
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
    if (!isExport) {
      const res = await fetchViaHTTP(appPort, '/%2Fgoogle.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(404)
      expect(await res.text()).toContain(notFoundContent)
    }

    const browser = await webdriver(appPort, '/%2Fgoogle.com')
    await didNotReload(browser)
    expect(await browser.eval('window.location.pathname')).toBe(
      '/%2Fgoogle.com'
    )
    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      notFoundContent
    )
  })

  it('should handle double slashes correctly with encoded and query', async () => {
    if (!isExport) {
      const res = await fetchViaHTTP(
        appPort,
        '/%2Fgoogle.com',
        { hello: '1' },
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(404)
      expect(await res.text()).toContain(notFoundContent)
    }

    const browser = await webdriver(appPort, '/%2Fgoogle.com?hello=1')
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
    if (!isExport) {
      const res = await fetchViaHTTP(appPort, '/%2Fgoogle.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(404)
      expect(await res.text()).toContain(notFoundContent)
    }

    const browser = await webdriver(appPort, '/%2Fgoogle.com#hello')
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
    if (!isExport) {
      const res = await fetchViaHTTP(appPort, '/\\google.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)
      const parsedUrl = url.parse(res.headers.get('location'), true)
      expect(parsedUrl.pathname).toBe('/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(parsedUrl.query).toEqual({})
      expect(await res.text()).toBe('/google.com')
    }

    const browser = await webdriver(appPort, '/\\google.com')
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
    if (!isExport) {
      const res = await fetchViaHTTP(appPort, '/\\/google.com', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)
      const parsedUrl = url.parse(res.headers.get('location'), true)
      expect(parsedUrl.pathname).toBe(isExport ? '//google.com' : '/google.com')
      expect(parsedUrl.hostname).toBeOneOf(['localhost', '127.0.0.1'])
      expect(parsedUrl.query).toEqual({})
      expect(await res.text()).toBe('/google.com')
    }

    const browser = await webdriver(appPort, '/\\/google.com#hello')
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
    const browser = await webdriver(
      appPort,
      `/invalid${isExport ? '.html' : ''}`
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
      await check(
        () =>
          browser.eval(
            'window.caughtErrors.map(err => typeof err !== "string" ? err.message : err).join(", ")'
          ),
        new RegExp(escapeRegex(`Invalid href '${href}'`))
      )
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
      const browser = await webdriver(appPort, '/')
      await browser.eval(
        `window.next.router.push("${item.href}"${
          item.as ? `, "${item.as}"` : ''
        })`
      )
      await check(
        () => browser.eval('document.readyState'),
        /interactive|complete/
      )
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
      const browser = await webdriver(appPort, '/')
      await browser.eval(`(function() {
        window.beforeNav = 1
        window.next.router.push("${item.href}"${
        item.as ? `, "${item.as}"` : ''
      })
      })()`)

      await check(
        () => browser.eval('window.location.pathname'),
        item.pathname || item.as || item.href
      )

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
  let nextOpts = {}
  beforeAll(async () => {
    const hasLocalNext = await fs.exists(join(appDir, 'node_modules/next'))

    if (hasLocalNext) {
      nextOpts = {
        nextBin: join(appDir, 'node_modules/next/dist/bin/next'),
        cwd: appDir,
      }
      console.log('Using next options', nextOpts)
    }
  })

  const devStartAndExport = (isPages404) => {
    describe('next dev', () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort, nextOpts)

        // prebuild pages
        await renderViaHTTP(appPort, '/')
        await renderViaHTTP(appPort, '/another')
      })
      afterAll(() => killApp(app))

      runTests({
        isPages404,
        isDev: true,
      })
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        describe('next start', () => {
          beforeAll(async () => {
            await nextBuild(appDir, [], nextOpts)
            appPort = await findPort()
            app = await nextStart(appDir, appPort, nextOpts)
          })
          afterAll(() => killApp(app))

          runTests({
            isPages404,
          })
        })

        describe('next export', () => {
          beforeAll(async () => {
            nextConfig.write(`module.exports = { output: 'export' }`)
            await nextBuild(appDir, [], nextOpts)
            app = await startStaticServer(outdir, join(outdir, '404.html'))
            appPort = app.address().port
          })
          afterAll(async () => {
            await stopApp(app)
            nextConfig.restore()
          })

          runTests({
            isPages404,
            isExport: true,
          })
        })
      }
    )
  }

  describe('custom _error', () => {
    devStartAndExport(false)
  })

  describe('pages/404', () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        const pagesErr = join(appDir, 'pages/_error.js')
        const pages404 = join(appDir, 'pages/404.js')

        beforeAll(async () => {
          await fs.move(pagesErr, pagesErr + '.bak')
          await fs.writeFile(
            pages404,
            `
          if (typeof window !== 'undefined') {
            window.errorLoad = true
          }
          export default function Page() {
            return <p id='error'>custom 404</p>
          }
        `
          )
          await nextBuild(appDir, [], nextOpts)
        })
        afterAll(async () => {
          await fs.move(pagesErr + '.bak', pagesErr)
          await fs.remove(pages404)
        })

        devStartAndExport(true)
      }
    )
  })
})
