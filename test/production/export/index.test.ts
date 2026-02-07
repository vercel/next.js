import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  renderViaHTTP,
  startStaticServer,
  check,
  getBrowserBodyText,
} from 'next-test-utils'
import { AddressInfo, Server } from 'net'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

describe('static export', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  const nextConfigPath = 'next.config.js'
  const outdir = 'out'
  const outNoTrailSlash = 'outNoTrailSlash'
  let server: Server
  let port: number
  let serverNoTrailSlash: Server
  let portNoTrailSlash: number

  beforeAll(async () => {
    const nextConfig = await next.readFile(nextConfigPath)
    await next.build()

    await next.patchFile(
      nextConfigPath,
      nextConfig
        .replace(`trailingSlash: true`, `trailingSlash: false`)
        .replace(`distDir: 'out'`, `distDir: '${outNoTrailSlash}'`)
    )
    await next.build()
    await next.patchFile(nextConfigPath, nextConfig)

    server = await startStaticServer(path.join(next.testDir, outdir))
    serverNoTrailSlash = await startStaticServer(
      path.join(next.testDir, outNoTrailSlash)
    )
    port = (server.address() as AddressInfo).port
    portNoTrailSlash = (serverNoTrailSlash.address() as AddressInfo).port
  })

  afterAll(async () => {
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => serverNoTrailSlash.close(resolve)),
    ])
  })

  it('should delete existing exported files', async () => {
    const tmpOutDir = 'tmpOutDir'
    const tempfile = path.join(tmpOutDir, 'temp.txt')
    await next.patchFile(tempfile, 'test')
    const nextConfig = await next.readFile(nextConfigPath)
    await next.patchFile(
      nextConfigPath,
      nextConfig.replace(`distDir: 'out'`, `distDir: '${tmpOutDir}'`)
    )
    await next.build()
    await next.patchFile(nextConfigPath, nextConfig)
    await expect(next.readFile(tempfile)).rejects.toThrow()
  })

  const fileExist = async (file: string) =>
    await next
      .readFile(file)
      .then(() => true)
      .catch(() => false)

  it('should honor trailingSlash for 404 page', async () => {
    expect(await fileExist(path.join(outdir, '404/index.html'))).toBe(true)

    // we still output 404.html for backwards compat
    expect(await fileExist(path.join(outdir, '404.html'))).toBe(true)
  })

  it('should handle trailing slash in getStaticPaths', async () => {
    expect(await fileExist(path.join(outdir, 'gssp/foo/index.html'))).toBe(true)

    expect(await fileExist(path.join(outNoTrailSlash, 'gssp/foo.html'))).toBe(
      true
    )
  })

  it('should only output 404.html without trailingSlash', async () => {
    expect(await fileExist(path.join(outNoTrailSlash, '404/index.html'))).toBe(
      false
    )

    expect(await fileExist(path.join(outNoTrailSlash, '404.html'))).toBe(true)
  })

  it('should not duplicate /index with trailingSlash', async () => {
    expect(await fileExist(path.join(outdir, 'index/index.html'))).toBe(false)

    expect(await fileExist(path.join(outdir, 'index.html'))).toBe(true)
  })

  describe('Dynamic routes export', () => {
    it('Should throw error not matched route', async () => {
      const outdir = 'outDynamic'
      const nextConfig = await next.readFile(nextConfigPath)
      await next.patchFile(
        nextConfigPath,
        nextConfig
          .replace('/blog/nextjs/comment/test', '/bad/path')
          .replace(`distDir: 'out'`, `distDir: '${outdir}'`)
      )
      const { cliOutput } = await next.build()
      await next.patchFile(nextConfigPath, nextConfig)

      expect(cliOutput).toContain(
        'https://nextjs.org/docs/messages/export-path-mismatch'
      )
    })
  })

  describe('Render via browser', () => {
    it('should render the home page', async () => {
      const browser = await webdriver(port, '/')
      const text = await browser.elementByCss('#home-page p').text()

      expect(text).toBe('This is the home page')
      await browser.close()
    })

    it('should add trailing slash on Link', async () => {
      const browser = await webdriver(port, '/')
      const link = await browser
        .elementByCss('#about-via-link')
        .getAttribute('href')

      expect(link.slice(-1)).toBe('/')
    })

    it('should not add any slash on hash Link', async () => {
      const browser = await webdriver(port, '/hash-link')
      const link = await browser.elementByCss('#hash-link').getAttribute('href')

      expect(link).toMatch(/\/hash-link\/#hash$/)
    })

    it('should preserve hash symbol on empty hash Link', async () => {
      const browser = await webdriver(port, '/empty-hash-link')
      const link = await browser
        .elementByCss('#empty-hash-link')
        .getAttribute('href')

      expect(link).toMatch(/\/hello\/#$/)
    })

    it('should preserve question mark on empty query Link', async () => {
      const browser = await webdriver(port, '/empty-query-link')
      const link = await browser
        .elementByCss('#empty-query-link')
        .getAttribute('href')

      expect(link).toMatch(/\/hello\/\?$/)
    })

    it('should not add trailing slash on Link when disabled', async () => {
      const browser = await webdriver(portNoTrailSlash, '/')
      const link = await browser
        .elementByCss('#about-via-link')
        .getAttribute('href')

      expect(link.slice(-1)).not.toBe('/')
    })

    it('should do navigations via Link', async () => {
      const browser = await webdriver(port, '/')
      const text = await browser
        .elementByCss('#about-via-link')
        .click()
        .waitForElementByCss('#about-page')
        .elementByCss('#about-page p')
        .text()

      expect(text).toBe('This is the About page')
      await browser.close()
    })

    it('should do navigations via Router', async () => {
      const browser = await webdriver(port, '/')
      const text = await browser
        .elementByCss('#about-via-router')
        .click()
        .waitForElementByCss('#about-page')
        .elementByCss('#about-page p')
        .text()

      expect(text).toBe('This is the About page')
      await browser.close()
    })

    it('should do run client side javascript', async () => {
      const browser = await webdriver(port, '/')
      const text = await browser
        .elementByCss('#counter')
        .click()
        .waitForElementByCss('#counter-page')
        .elementByCss('#counter-increase')
        .click()
        .elementByCss('#counter-increase')
        .click()
        .elementByCss('#counter-page p')
        .text()

      expect(text).toBe('Counter: 2')
      await browser.close()
    })

    it('should render pages using getInitialProps', async () => {
      const browser = await webdriver(port, '/')
      const text = await browser
        .elementByCss('#get-initial-props')
        .click()
        .waitForElementByCss('#dynamic-page')
        .elementByCss('#dynamic-page p')
        .text()

      expect(text).toBe('cool dynamic text')
      await browser.close()
    })

    it('should render dynamic pages with custom urls', async () => {
      const browser = await webdriver(port, '/')
      const text = await browser
        .elementByCss('#dynamic-1')
        .click()
        .waitForElementByCss('#dynamic-page')
        .elementByCss('#dynamic-page p')
        .text()

      expect(text).toBe('next export is nice')
      await browser.close()
    })

    it('should support client side navigation', async () => {
      const browser = await webdriver(port, '/')
      const text = await browser
        .elementByCss('#counter')
        .click()
        .waitForElementByCss('#counter-page')
        .elementByCss('#counter-increase')
        .click()
        .elementByCss('#counter-increase')
        .click()
        .elementByCss('#counter-page p')
        .text()

      expect(text).toBe('Counter: 2')

      // let's go back and come again to this page:
      const textNow = await browser
        .elementByCss('#go-back')
        .click()
        .waitForElementByCss('#home-page')
        .elementByCss('#counter')
        .click()
        .waitForElementByCss('#counter-page')
        .elementByCss('#counter-page p')
        .text()

      expect(textNow).toBe('Counter: 2')

      await browser.close()
    })

    it('should render dynamic import components in the client', async () => {
      const browser = await webdriver(port, '/')
      await browser
        .elementByCss('#dynamic-imports-link')
        .click()
        .waitForElementByCss('#dynamic-imports-page')

      await check(
        () => getBrowserBodyText(browser),
        /Welcome to dynamic imports/
      )

      await browser.close()
    })

    it('should render pages with url hash correctly', async () => {
      let browser
      try {
        browser = await webdriver(port, '/')

        // Check for the query string content
        const text = await browser
          .elementByCss('#with-hash')
          .click()
          .waitForElementByCss('#dynamic-page')
          .elementByCss('#dynamic-page p')
          .text()

        expect(text).toBe('Vercel is awesome')

        await check(() => browser.elementByCss('#hash').text(), /cool/)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should render 404 when visiting a page that returns notFound from gsp', async () => {
      let browser
      try {
        browser = await webdriver(port, '/')

        const text = await browser
          .elementByCss('#gsp-notfound-link')
          .click()
          .waitForElementByCss('pre')
          .elementByCss('pre')
          .text()

        expect(text).toBe('Cannot GET /gsp-notfound/')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should navigate even if used a button inside <Link />', async () => {
      const browser = await webdriver(port, '/button-link')

      const text = await browser
        .elementByCss('button')
        .click()
        .waitForElementByCss('#home-page')
        .elementByCss('#home-page p')
        .text()

      expect(text).toBe('This is the home page')
      await browser.close()
    })

    it('should update query after mount', async () => {
      const browser = await webdriver(port, '/query-update?hello=world')
      const query = await browser.elementByCss('#query').text()
      expect(JSON.parse(query)).toEqual({ hello: 'world', a: 'blue' })
      await browser.close()
    })

    describe('pages in the nested level: level1', () => {
      it('should render the home page', async () => {
        const browser = await webdriver(port, '/')

        await browser.eval(
          'document.getElementById("level1-home-page").click()'
        )

        await check(
          () => getBrowserBodyText(browser),
          /This is the Level1 home page/
        )

        await browser.close()
      })

      it('should render the about page', async () => {
        const browser = await webdriver(port, '/')

        await browser.eval(
          'document.getElementById("level1-about-page").click()'
        )

        await check(
          () => getBrowserBodyText(browser),
          /This is the Level1 about page/
        )

        await browser.close()
      })
    })
  })

  describe('Render via SSR', () => {
    it('should render the home page', async () => {
      const html = await renderViaHTTP(port, '/')
      expect(html).toMatch(/This is the home page/)
    })

    it('should render the about page', async () => {
      const html = await renderViaHTTP(port, '/about')
      expect(html).toMatch(/This is the About page/)
    })

    it('should render links correctly', async () => {
      const html = await renderViaHTTP(port, '/')
      const $ = cheerio.load(html)
      const dynamicLink = $('#dynamic-1').prop('href')
      const filePathLink = $('#path-with-extension').prop('href')
      expect(dynamicLink).toEqual('/dynamic/one/')
      expect(filePathLink).toEqual('/file-name.md')
    })

    it('should render a page with getInitialProps', async () => {
      const html = await renderViaHTTP(port, '/dynamic')
      expect(html).toMatch(/cool dynamic text/)
    })

    it('should render a dynamically rendered custom url page', async () => {
      const html = await renderViaHTTP(port, '/dynamic/one')
      expect(html).toMatch(/next export is nice/)
    })

    it('should render pages with dynamic imports', async () => {
      const html = await renderViaHTTP(port, '/dynamic-imports')
      expect(html).toMatch(/Welcome to dynamic imports/)
    })

    it('should render paths with extensions', async () => {
      const html = await renderViaHTTP(port, '/file-name.md')
      expect(html).toMatch(/this file has an extension/)
    })

    it('should give empty object for query if there is no query', async () => {
      const html = await renderViaHTTP(port, '/get-initial-props-with-no-query')
      expect(html).toMatch(/Query is: {}/)
    })

    it('should render _error on 404.html even if not provided in exportPathMap', async () => {
      const html = await renderViaHTTP(port, '/404.html')
      // The default error page from the test server
      // contains "404", so need to be specific here
      expect(html).toMatch(/404.*page.*not.*found/i)
    })

    // since exportTrailingSlash is enabled we should allow this
    it('should render _error on /404/index.html', async () => {
      const html = await renderViaHTTP(port, '/404/index.html')
      // The default error page from the test server
      // contains "404", so need to be specific here
      expect(html).toMatch(/404.*page.*not.*found/i)
    })

    it('Should serve static files', async () => {
      const data = await renderViaHTTP(port, '/static/data/item.txt')
      expect(data).toBe('item')
    })

    it('Should serve public files', async () => {
      const html = await renderViaHTTP(port, '/about')
      const data = await renderViaHTTP(port, '/about/data.txt')
      expect(html).toMatch(/This is the About page/)
      expect(data).toBe('data')
    })

    it('Should render dynamic files with query', async () => {
      const html = await renderViaHTTP(port, '/blog/nextjs/comment/test')
      expect(html).toMatch(/Blog post nextjs comment test/)
    })
  })

  describe('API routes export', () => {
    it('Should throw if a route is matched', async () => {
      const outdir = 'outApi'
      const nextConfig = await next.readFile(nextConfigPath)
      await next.patchFile(
        nextConfigPath,
        nextConfig
          .replace('// API route', `'/data': { page: '/api/data' },`)
          .replace(`distDir: 'out'`, `distDir: '${outdir}'`)
      )
      const { cliOutput } = await next.build()
      await next.patchFile(nextConfigPath, nextConfig)

      expect(cliOutput).toContain(
        'https://nextjs.org/docs/messages/api-routes-static-export'
      )
    })
  })

  it('exportTrailingSlash is not ignored', async () => {
    const nextConfig = await next.readFile(nextConfigPath)
    const tmpOutdir = 'exportTrailingSlash-out'
    await next.patchFile(
      nextConfigPath,
      nextConfig
        .replace(`trailingSlash: true`, `exportTrailingSlash: true`)
        .replace(`distDir: 'out'`, `distDir: '${tmpOutdir}'`)
    )
    await next.build()
    await next.patchFile(nextConfigPath, nextConfig)
    expect(await fileExist(path.join(tmpOutdir, '404/index.html'))).toBeTrue()
  })
})
