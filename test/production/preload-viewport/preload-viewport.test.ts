/* eslint-disable jest/no-standalone-expect */
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  retry,
  waitFor,
  getClientBuildManifestLoaderChunkUrlPath,
} from 'next-test-utils'

describe('Prefetching Links in viewport', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    dependencies: {
      'http-proxy': '1.18.1',
    },
  })
  if (skipped) return

  let proxyChild: ChildProcess
  let proxyPort: number
  let buildId: string

  async function getDataRequests(): Promise<string[]> {
    const res = await fetch(`http://localhost:${proxyPort}/_test/data-requests`)
    const data = (await res.json()) as { nextDataRequests: string[] }
    return data.nextDataRequests
  }

  async function resetDataRequests() {
    await fetch(`http://localhost:${proxyPort}/_test/data-requests/reset`)
  }

  async function setStall(on: boolean) {
    await fetch(
      `http://localhost:${proxyPort}/_test/stall/${on ? 'on' : 'off'}`
    )
  }

  beforeAll(async () => {
    await next.build()
    buildId = await next.readFile('.next/BUILD_ID')
    await next.start({ skipBuild: true })

    proxyChild = spawn(
      process.execPath,
      [join(next.testDir, 'server.js'), next.url, '0'],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    )

    proxyPort = await new Promise<number>((resolve, reject) => {
      let buf = ''
      const onData = (chunk: Buffer) => {
        buf += chunk.toString()
        const m = buf.match(/__PORT__:(\d+)/)
        if (m) {
          proxyChild.stdout!.off('data', onData)
          resolve(Number(m[1]))
        }
      }
      proxyChild.stdout!.on('data', onData)
      proxyChild.once('exit', (code) => {
        reject(new Error(`proxy server exited early with code ${code}`))
      })
    })
  })

  afterAll(async () => {
    proxyChild?.kill()
  })

  it('should de-dupe inflight SSG requests', async () => {
    await resetDataRequests()
    const browser = await next.browser('/', { baseUrl: proxyPort })
    await browser.eval(function navigate() {
      ;(window as any).next.router.push('/ssg/slow')
      ;(window as any).next.router.push('/ssg/slow')
      ;(window as any).next.router.push('/ssg/slow')
    })
    await browser.waitForElementByCss('#content')
    const dataRequests = await getDataRequests()
    expect(
      dataRequests.filter((reqUrl) => reqUrl.includes('/ssg/slow.json')).length
    ).toBe(2)
  })

  it('should handle timed out prefetch correctly', async () => {
    try {
      await setStall(true)
      const browser = await next.browser('/', { baseUrl: proxyPort })

      await browser.elementByCss('#scroll-to-another').click()
      // wait for preload to timeout
      await waitFor(6 * 1000)

      await browser
        .elementByCss('#link-another')
        .click()
        .waitForElementByCss('#another')

      expect(await browser.elementByCss('#another').text()).toBe('Hello world')
    } finally {
      await setStall(false)
    }
  })

  it('should prefetch with link in viewport onload', async () => {
    let browser
    try {
      browser = await next.browser('/', { baseUrl: proxyPort })

      await retry(async () => {
        const links = await browser.elementsByCss('link[rel=prefetch]')

        const hrefs = await Promise.all(
          links.map((link) => link.getAttribute('href'))
        )
        let chunk = getClientBuildManifestLoaderChunkUrlPath(
          next.testDir,
          '/first'
        )
        expect(hrefs).toEqual(
          expect.arrayContaining([expect.stringContaining(chunk)])
        )
      })
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should prefetch with non-bot UA', async () => {
    let browser
    try {
      browser = await next.browser(
        `/bot-user-agent?useragent=${encodeURIComponent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36'
        )}`,
        { baseUrl: proxyPort }
      )
      await retry(async () => {
        const links = await browser.elementsByCss('link[rel=prefetch]')
        expect(links).toHaveLength(1)
      })
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should not prefetch with bot UA', async () => {
    let browser
    try {
      browser = await next.browser(
        `/bot-user-agent?useragent=${encodeURIComponent(
          'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        )}`,
        { baseUrl: proxyPort }
      )
      const links = await browser.elementsByCss('link[rel=prefetch]')
      expect(links).toHaveLength(0)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should prefetch rewritten href with link in viewport onload', async () => {
    let browser
    try {
      browser = await next.browser('/rewrite-prefetch', { baseUrl: proxyPort })

      await retry(async () => {
        const links = await browser.elementsByCss('link[rel=prefetch]')

        const hrefs = await Promise.all(
          links.map((link) => link.getAttribute('href'))
        )

        let chunk = getClientBuildManifestLoaderChunkUrlPath(
          next.testDir,
          '/ssg/dynamic/[slug]'
        )
        expect(hrefs).toEqual(
          expect.arrayContaining([expect.stringContaining(chunk)])
        )
      })
      const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
      expect(hrefs.map((href) => new URL(href).pathname)).toEqual([
        `/_next/data/${buildId}/ssg/dynamic/one.json`,
      ])
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should prefetch with link in viewport when href changes', async () => {
    let browser
    try {
      browser = await next.browser('/', { baseUrl: proxyPort })
      await browser.elementByCss('button').click()
      await waitFor(2 * 1000)

      const links = await browser.elementsByCss('link[rel=prefetch]')
      let foundFirst = false
      let foundAnother = false

      let chunkFirst = getClientBuildManifestLoaderChunkUrlPath(
        next.testDir,
        '/first'
      )
      let chunkAnother = getClientBuildManifestLoaderChunkUrlPath(
        next.testDir,
        '/another'
      )

      for (const link of links) {
        const href = await link.getAttribute('href')
        if (href.includes(chunkAnother)) foundAnother = true
        if (href.includes(chunkFirst)) foundFirst = true
      }
      expect(foundFirst).toBe(true)
      expect(foundAnother).toBe(true)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should prefetch with link in viewport on scroll', async () => {
    let browser
    try {
      browser = await next.browser('/', { baseUrl: proxyPort })
      await browser.elementByCss('#scroll-to-another').click()

      await retry(async () => {
        const links = await browser.elementsByCss('link[rel=prefetch]')

        const hrefs = await Promise.all(
          links.map((link) => link.getAttribute('href'))
        )
        let chunk = getClientBuildManifestLoaderChunkUrlPath(
          next.testDir,
          '/another'
        )
        expect(hrefs).toEqual(
          expect.arrayContaining([expect.stringContaining(chunk)])
        )
      })
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should prefetch with link in viewport and inject script on hover', async () => {
    let browser
    try {
      browser = await next.browser('/', { baseUrl: proxyPort })
      await browser.elementByCss('#scroll-to-another').click()

      await retry(async () => {
        const links = await browser.elementsByCss('link[rel=prefetch]')

        const hrefs = await Promise.all(
          links.map((link) => link.getAttribute('href'))
        )
        let chunk = getClientBuildManifestLoaderChunkUrlPath(
          next.testDir,
          '/another'
        )
        expect(hrefs).toEqual(
          expect.arrayContaining([expect.stringContaining(chunk)])
        )
      })

      await browser.elementByCss('#link-another').moveTo()

      await retry(async () => {
        const scripts = await browser.elementsByCss('script:not([async])')

        const srcProps = await Promise.all(
          scripts.map((script) => script.getAttribute('src'))
        )
        let chunk = getClientBuildManifestLoaderChunkUrlPath(
          next.testDir,
          '/another'
        )
        expect(srcProps).toEqual(
          expect.arrayContaining([expect.stringContaining(chunk)])
        )
      })
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should inject script on hover with prefetching disabled', async () => {
    let browser
    try {
      browser = await next.browser('/prefetch-disabled', {
        baseUrl: proxyPort,
      })

      let chunkAnother = getClientBuildManifestLoaderChunkUrlPath(
        next.testDir,
        '/another'
      )
      await retry(async () => {
        const links = await browser.elementsByCss('link[rel=prefetch]')

        const hrefs = await Promise.all(
          links.map((link) => link.getAttribute('href'))
        )
        expect(hrefs).toEqual(
          expect.not.arrayContaining([expect.stringContaining(chunkAnother)])
        )
      })

      async function hasAnotherScript() {
        const scripts = await browser.elementsByCss('script:not([async])')
        let scriptFound = false
        for (const aScript of scripts) {
          const href = await aScript.getAttribute('src')
          if (href.includes(chunkAnother)) {
            scriptFound = true
            break
          }
        }
        return scriptFound
      }

      expect(await hasAnotherScript()).toBe(false)
      await browser.elementByCss('#link-another').moveTo()
      await waitFor(2 * 1000)
      expect(await hasAnotherScript()).toBe(true)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should inject script on hover with prefetching disabled and fetch data', async () => {
    let browser
    try {
      browser = await next.browser('/prefetch-disabled-ssg', {
        baseUrl: proxyPort,
      })

      let chunkBasic = getClientBuildManifestLoaderChunkUrlPath(
        next.testDir,
        '/ssg/basic'
      )
      async function hasSsgScript() {
        const scripts = await browser.elementsByCss('script:not([async])')
        let scriptFound = false
        for (const aScript of scripts) {
          const href = await aScript.getAttribute('src')
          if (href.includes(chunkBasic)) {
            scriptFound = true
            break
          }
        }
        return scriptFound
      }

      await waitFor(2 * 1000)
      expect(await hasSsgScript()).toBe(false)
      const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
      expect(hrefs.map((href) => new URL(href).pathname)).toEqual([])
      await browser.elementByCss('#link-ssg').moveTo()
      await waitFor(2 * 1000)
      expect(await hasSsgScript()).toBe(true)
      const hrefs2 = await browser.eval(`Object.keys(window.next.router.sdc)`)
      expect(hrefs2.map((href) => new URL(href).pathname)).toEqual([
        `/_next/data/${buildId}/ssg/basic.json`,
      ])
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should inject a <script> tag when onMouseEnter (even with invalid ref)', async () => {
    let browser
    try {
      browser = await next.browser('/invalid-ref', { baseUrl: proxyPort })
      await browser.elementByCss('#btn-link').moveTo()

      await retry(async () => {
        const scripts = await browser.elementsByCss('script:not([async])')

        const srcProps = await Promise.all(
          scripts.map((script) => script.getAttribute('src'))
        )
        let chunk = getClientBuildManifestLoaderChunkUrlPath(
          next.testDir,
          '/another'
        )
        expect(srcProps).toEqual(
          expect.arrayContaining([expect.stringContaining(chunk)])
        )
      })
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should not have unhandledRejection when failing to prefetch on link', async () => {
    const browser = await next.browser('/', { baseUrl: proxyPort })
    await browser.eval(`(function() {
      window.addEventListener('unhandledrejection', function (err) {
        window.hadUnhandledReject = true;
      })
      window.next.router.push('/invalid-prefetch');
    })()`)

    expect(await browser.eval('window.hadUnhandledReject')).toBeFalsy()

    await browser.waitForElementByCss('#invalid-link')
    await browser.elementByCss('#invalid-link').moveTo()
    expect(await browser.eval('window.hadUnhandledReject')).toBeFalsy()
  })

  it('should not prefetch when prefetch is explicitly set to false', async () => {
    const browser = await next.browser('/opt-out', { baseUrl: proxyPort })

    await retry(async () => {
      const links = await browser.elementsByCss('link[rel=prefetch]')
      const hrefs = await Promise.all(
        links.map((link) => link.getAttribute('href'))
      )
      let chunk = getClientBuildManifestLoaderChunkUrlPath(
        next.testDir,
        '/another'
      )
      expect(hrefs).toEqual(
        expect.not.arrayContaining([expect.stringContaining(chunk)])
      )
    })
  })
  ;(isTurbopack ? it.skip : it)(
    'should not prefetch already loaded scripts',
    async () => {
      const browser = await next.browser('/', { baseUrl: proxyPort })

      const scriptSrcs = await browser.eval(`(function() {
      return Array.from(document.querySelectorAll('script'))
        .map(function(el) {
          return el.src && new URL(el.src).pathname
        }).filter(Boolean)
    })()`)

      await browser.eval('next.router.prefetch("/")')

      const linkHrefs = await browser.eval(`(function() {
      return Array.from(document.querySelectorAll('link'))
        .map(function(el) {
          return el.href && new URL(el.href).pathname
        }).filter(Boolean)
    })()`)

      expect(scriptSrcs.some((src) => src.includes('pages/index-'))).toBe(true)
      expect(linkHrefs.some((href) => href.includes('pages/index-'))).toBe(
        false
      )
    }
  )

  it('should not duplicate prefetches', async () => {
    const browser = await next.browser('/multi-prefetch', {
      baseUrl: proxyPort,
    })

    const links = await browser.elementsByCss('link[rel=prefetch]')

    const hrefs = []
    for (const link of links) {
      const href = await link.getAttribute('href')
      hrefs.push(href)
    }
    hrefs.sort()

    expect(hrefs).toEqual([...new Set(hrefs)])

    let chunk = getClientBuildManifestLoaderChunkUrlPath(
      next.testDir,
      '/dynamic/[hello]'
    )
    expect(hrefs.some((e) => e.includes(chunk))).toBe(true)
  })

  it('should not re-prefetch for an already prefetched page', async () => {
    const browser = await next.browser('/', { baseUrl: proxyPort })

    await retry(async () => {
      const links = await browser.elementsByCss('link[rel=prefetch]')
      const hrefs = await Promise.all(
        links.map((link) => link.getAttribute('href'))
      )
      let chunk = getClientBuildManifestLoaderChunkUrlPath(
        next.testDir,
        '/first'
      )
      expect(hrefs).toEqual(
        expect.arrayContaining([expect.stringContaining(chunk)])
      )
    })

    await browser.eval(`(function() {
      window.calledPrefetch = false
      window.next.router.prefetch = function() {
        window.calledPrefetch = true
        return Promise.resolve()
      }
      window.next.router.push('/de-duped')
    })()`)
    await retry(async () => {
      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toMatch(/to \/first/)
    })
    const calledPrefetch = await browser.eval(`window.calledPrefetch`)
    expect(calledPrefetch).toBe(false)
  })

  it('should prefetch with a different asPath for a prefetched page', async () => {
    const browser = await next.browser('/', { baseUrl: proxyPort })
    await browser.eval(`(function() {
      window.calledPrefetch = false
      window.next.router.prefetch = function() {
        window.calledPrefetch = true
        return Promise.resolve()
      }
      window.next.router.push('/not-de-duped')
    })()`)
    await waitFor(2 * 1000)
    const calledPrefetch = await browser.eval(`window.calledPrefetch`)
    expect(calledPrefetch).toBe(true)
  })

  it('should correctly omit pre-generated dynamic pages from SSG manifest', async () => {
    const content = await next.readFile(
      join('.next', 'static', buildId, '_ssgManifest.js')
    )

    let self: Record<string, any> = {}
    // eslint-disable-next-line no-eval
    eval(content)
    expect([...self.__SSG_MANIFEST].sort()).toMatchInlineSnapshot(`
      [
        "/[...rest]",
        "/ssg/basic",
        "/ssg/catch-all/[...slug]",
        "/ssg/dynamic-nested/[slug1]/[slug2]",
        "/ssg/dynamic/[slug]",
        "/ssg/slow",
      ]
    `)
  })

  it('should prefetch data files', async () => {
    const browser = await next.browser('/ssg/fixture', { baseUrl: proxyPort })
    await waitFor(2 * 1000)

    const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
    hrefs.sort()

    expect(hrefs.map((href) => new URL(href).pathname)).toEqual([
      `/_next/data/${buildId}/ssg/basic.json`,
      `/_next/data/${buildId}/ssg/catch-all/foo.json`,
      `/_next/data/${buildId}/ssg/catch-all/foo/bar.json`,
      `/_next/data/${buildId}/ssg/catch-all/one.json`,
      `/_next/data/${buildId}/ssg/catch-all/one/two.json`,
      `/_next/data/${buildId}/ssg/dynamic-nested/foo/bar.json`,
      `/_next/data/${buildId}/ssg/dynamic-nested/one/two.json`,
      `/_next/data/${buildId}/ssg/dynamic/one.json`,
      `/_next/data/${buildId}/ssg/dynamic/two.json`,
    ])
  })

  it('should prefetch data files when mismatched', async () => {
    const browser = await next.browser('/ssg/fixture/mismatch', {
      baseUrl: proxyPort,
    })
    await waitFor(2 * 1000)

    const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
    hrefs.sort()

    expect(hrefs.map((href) => new URL(href).pathname)).toEqual([
      `/_next/data/${buildId}/ssg/catch-all/foo.json`,
      `/_next/data/${buildId}/ssg/catch-all/foo/bar.json`,
      `/_next/data/${buildId}/ssg/catch-all/one.json`,
      `/_next/data/${buildId}/ssg/catch-all/one/two.json`,
      `/_next/data/${buildId}/ssg/dynamic-nested/foo/bar.json`,
      `/_next/data/${buildId}/ssg/dynamic-nested/one/two.json`,
      `/_next/data/${buildId}/ssg/dynamic/one.json`,
      `/_next/data/${buildId}/ssg/dynamic/two.json`,
    ])
  })
})
