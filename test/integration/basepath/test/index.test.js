/* eslint-env jest */

import assert from 'assert'
import cheerio from 'cheerio'
import fs, {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs-extra'
import {
  check,
  fetchViaHTTP,
  File,
  findPort,
  getBrowserBodyText,
  getRedboxSource,
  hasRedbox,
  initNextServerScript,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  startStaticServer,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join, resolve } from 'path'
import url from 'url'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')

let externalApp
let app
let appPort
let basePath = '/docs'

const nextConfig = new File(resolve(appDir, 'next.config.js'))

beforeAll(async () => {
  externalApp = await startStaticServer(resolve(__dirname, '../external'))
  nextConfig.replace(
    '__EXTERNAL_APP_PORT__',
    String(externalApp.address().port)
  )
})

afterAll(async () => {
  nextConfig.restore()
  externalApp.close()
})

const runTests = (dev = false) => {
  it('should navigate back correctly to a dynamic route', async () => {
    const browser = await webdriver(appPort, `${basePath}`)

    expect(await browser.elementByCss('#index-page').text()).toContain(
      'index page'
    )

    await browser.eval('window.beforeNav = 1')

    await browser.eval('window.next.router.push("/catchall/first")')
    await check(() => browser.elementByCss('p').text(), /first/)
    expect(await browser.eval('window.beforeNav')).toBe(1)

    await browser.eval('window.next.router.push("/catchall/second")')
    await check(() => browser.elementByCss('p').text(), /second/)
    expect(await browser.eval('window.beforeNav')).toBe(1)

    await browser.eval('window.next.router.back()')
    await check(() => browser.elementByCss('p').text(), /first/)
    expect(await browser.eval('window.beforeNav')).toBe(1)

    await browser.eval('window.history.forward()')
    await check(() => browser.elementByCss('p').text(), /second/)
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  if (dev) {
    describe('Hot Module Reloading', () => {
      describe('delete a page and add it back', () => {
        it('should load the page properly', async () => {
          const contactPagePath = join(
            __dirname,
            '../',
            'pages',
            'hmr',
            'contact.js'
          )
          const newContactPagePath = join(
            __dirname,
            '../',
            'pages',
            'hmr',
            '_contact.js'
          )
          let browser
          try {
            browser = await webdriver(appPort, `${basePath}/hmr/contact`)
            const text = await browser.elementByCss('p').text()
            expect(text).toBe('This is the contact page.')

            // Rename the file to mimic a deleted page
            renameSync(contactPagePath, newContactPagePath)

            await check(
              () => getBrowserBodyText(browser),
              /This page could not be found/
            )

            // Rename the file back to the original filename
            renameSync(newContactPagePath, contactPagePath)

            // wait until the page comes back
            await check(
              () => getBrowserBodyText(browser),
              /This is the contact page/
            )
          } finally {
            if (browser) {
              await browser.close()
            }
            if (existsSync(newContactPagePath)) {
              renameSync(newContactPagePath, contactPagePath)
            }
          }
        })
      })

      describe('editing a page', () => {
        it('should detect the changes and display it', async () => {
          let browser
          try {
            browser = await webdriver(appPort, `${basePath}/hmr/about`)
            const text = await browser.elementByCss('p').text()
            expect(text).toBe('This is the about page.')

            const aboutPagePath = join(
              __dirname,
              '../',
              'pages',
              'hmr',
              'about.js'
            )

            const originalContent = readFileSync(aboutPagePath, 'utf8')
            const editedContent = originalContent.replace(
              'This is the about page',
              'COOL page'
            )

            // change the content
            writeFileSync(aboutPagePath, editedContent, 'utf8')

            await check(() => getBrowserBodyText(browser), /COOL page/)

            // add the original content
            writeFileSync(aboutPagePath, originalContent, 'utf8')

            await check(
              () => getBrowserBodyText(browser),
              /This is the about page/
            )
          } finally {
            if (browser) {
              await browser.close()
            }
          }
        })

        it('should not reload unrelated pages', async () => {
          let browser
          try {
            browser = await webdriver(appPort, `${basePath}/hmr/counter`)
            const text = await browser
              .elementByCss('button')
              .click()
              .elementByCss('button')
              .click()
              .elementByCss('p')
              .text()
            expect(text).toBe('COUNT: 2')

            const aboutPagePath = join(
              __dirname,
              '../',
              'pages',
              'hmr',
              'about.js'
            )

            const originalContent = readFileSync(aboutPagePath, 'utf8')
            const editedContent = originalContent.replace(
              'This is the about page',
              'COOL page'
            )

            // Change the about.js page
            writeFileSync(aboutPagePath, editedContent, 'utf8')

            // wait for 5 seconds
            await waitFor(5000)

            // Check whether the this page has reloaded or not.
            const newText = await browser.elementByCss('p').text()
            expect(newText).toBe('COUNT: 2')

            // restore the about page content.
            writeFileSync(aboutPagePath, originalContent, 'utf8')
          } finally {
            if (browser) {
              await browser.close()
            }
          }
        })

        // Added because of a regression in react-hot-loader, see issues: #4246 #4273
        // Also: https://github.com/vercel/styled-jsx/issues/425
        it('should update styles correctly', async () => {
          let browser
          try {
            browser = await webdriver(appPort, `${basePath}/hmr/style`)
            const pTag = await browser.elementByCss('.hmr-style-page p')
            const initialFontSize = await pTag.getComputedCss('font-size')

            expect(initialFontSize).toBe('100px')

            const pagePath = join(__dirname, '../', 'pages', 'hmr', 'style.js')

            const originalContent = readFileSync(pagePath, 'utf8')
            const editedContent = originalContent.replace('100px', '200px')

            // Change the page
            writeFileSync(pagePath, editedContent, 'utf8')

            try {
              // Check whether the this page has reloaded or not.
              await check(async () => {
                const editedPTag = await browser.elementByCss(
                  '.hmr-style-page p'
                )
                return editedPTag.getComputedCss('font-size')
              }, /200px/)
            } finally {
              // Finally is used so that we revert the content back to the original regardless of the test outcome
              // restore the about page content.
              writeFileSync(pagePath, originalContent, 'utf8')
            }
          } finally {
            if (browser) {
              await browser.close()
            }
          }
        })

        // Added because of a regression in react-hot-loader, see issues: #4246 #4273
        // Also: https://github.com/vercel/styled-jsx/issues/425
        it('should update styles in a stateful component correctly', async () => {
          let browser
          const pagePath = join(
            __dirname,
            '../',
            'pages',
            'hmr',
            'style-stateful-component.js'
          )
          const originalContent = readFileSync(pagePath, 'utf8')
          try {
            browser = await webdriver(
              appPort,
              `${basePath}/hmr/style-stateful-component`
            )
            const pTag = await browser.elementByCss('.hmr-style-page p')
            const initialFontSize = await pTag.getComputedCss('font-size')

            expect(initialFontSize).toBe('100px')
            const editedContent = originalContent.replace('100px', '200px')

            // Change the page
            writeFileSync(pagePath, editedContent, 'utf8')

            // Check whether the this page has reloaded or not.
            await check(async () => {
              const editedPTag = await browser.elementByCss('.hmr-style-page p')
              return editedPTag.getComputedCss('font-size')
            }, /200px/)
          } finally {
            if (browser) {
              await browser.close()
            }
            writeFileSync(pagePath, originalContent, 'utf8')
          }
        })

        // Added because of a regression in react-hot-loader, see issues: #4246 #4273
        // Also: https://github.com/vercel/styled-jsx/issues/425
        it('should update styles in a dynamic component correctly', async () => {
          let browser = null
          let secondBrowser = null
          const pagePath = join(
            __dirname,
            '../',
            'components',
            'hmr',
            'dynamic.js'
          )
          const originalContent = readFileSync(pagePath, 'utf8')
          try {
            browser = await webdriver(
              appPort,
              `${basePath}/hmr/style-dynamic-component`
            )
            const div = await browser.elementByCss('#dynamic-component')
            const initialClientClassName = await div.getAttribute('class')
            const initialFontSize = await div.getComputedCss('font-size')

            expect(initialFontSize).toBe('100px')

            const initialHtml = await renderViaHTTP(
              appPort,
              `${basePath}/hmr/style-dynamic-component`
            )
            expect(initialHtml.includes('100px')).toBeTruthy()

            const $initialHtml = cheerio.load(initialHtml)
            const initialServerClassName = $initialHtml(
              '#dynamic-component'
            ).attr('class')

            expect(
              initialClientClassName === initialServerClassName
            ).toBeTruthy()

            const editedContent = originalContent.replace('100px', '200px')

            // Change the page
            writeFileSync(pagePath, editedContent, 'utf8')

            // wait for 5 seconds
            await waitFor(5000)

            secondBrowser = await webdriver(
              appPort,
              `${basePath}/hmr/style-dynamic-component`
            )
            // Check whether the this page has reloaded or not.
            const editedDiv = await secondBrowser.elementByCss(
              '#dynamic-component'
            )
            const editedClientClassName = await editedDiv.getAttribute('class')
            const editedFontSize = await editedDiv.getComputedCss('font-size')
            const browserHtml = await secondBrowser
              .elementByCss('html')
              .getAttribute('innerHTML')

            expect(editedFontSize).toBe('200px')
            expect(browserHtml.includes('font-size:200px;')).toBe(true)
            expect(browserHtml.includes('font-size:100px;')).toBe(false)

            const editedHtml = await renderViaHTTP(
              appPort,
              `${basePath}/hmr/style-dynamic-component`
            )
            expect(editedHtml.includes('200px')).toBeTruthy()
            const $editedHtml = cheerio.load(editedHtml)
            const editedServerClassName = $editedHtml(
              '#dynamic-component'
            ).attr('class')

            expect(editedClientClassName === editedServerClassName).toBe(true)
          } finally {
            // Finally is used so that we revert the content back to the original regardless of the test outcome
            // restore the about page content.
            writeFileSync(pagePath, originalContent, 'utf8')

            if (browser) {
              await browser.close()
            }

            if (secondBrowser) {
              secondBrowser.close()
            }
          }
        })
      })
    })

    it('should respect basePath in amphtml link rel', async () => {
      const html = await renderViaHTTP(appPort, `${basePath}/amp-hybrid`)
      const $ = cheerio.load(html)
      const expectedAmpHtmlUrl = `${basePath}/amp-hybrid?amp=1`
      expect($('link[rel=amphtml]').first().attr('href')).toBe(
        expectedAmpHtmlUrl
      )
    })

    it('should render error in dev overlay correctly', async () => {
      const browser = await webdriver(appPort, `${basePath}/hello`)
      await browser.elementByCss('#trigger-error').click()
      expect(await hasRedbox(browser)).toBe(true)

      const errorSource = await getRedboxSource(browser)
      expect(errorSource).toMatchInlineSnapshot(`
        "pages${
          process.platform === 'win32' ? '\\\\' : '/'
        }hello.js (56:14) @ onClick

          54 |   id=\\"trigger-error\\"
          55 |   onClick={() => {
        > 56 |     throw new Error('oops heres an error')
             |          ^
          57 |   }}
          58 | >
          59 |   click me for error"
      `)
    })
  } else {
    it('should add basePath to routes-manifest', async () => {
      const routesManifest = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )
      expect(routesManifest.basePath).toBe(basePath)
    })

    it('should prefetch pages correctly when manually called', async () => {
      const browser = await webdriver(appPort, `${basePath}/other-page`)
      await browser.eval('window.next.router.prefetch("/gssp")')

      await check(
        async () => {
          const links = await browser.elementsByCss('link[rel=prefetch]')

          for (const link of links) {
            const href = await link.getAttribute('href')
            if (href.includes('gssp')) {
              return true
            }
          }
          return false
        },
        {
          test(result) {
            return result === true
          },
        }
      )
    })

    it('should prefetch pages correctly in viewport with <Link>', async () => {
      const browser = await webdriver(appPort, `${basePath}/hello`)
      await browser.eval('window.next.router.prefetch("/gssp")')

      await check(async () => {
        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        hrefs.sort()

        assert.deepEqual(
          hrefs.map((href) =>
            new URL(href).pathname.replace(/\/_next\/data\/[^/]+/, '')
          ),
          [
            `${basePath}/gsp.json`,
            `${basePath}/index.json`,
            `${basePath}/index/index.json`,
          ]
        )

        const prefetches = await browser.eval(
          `[].slice.call(document.querySelectorAll("link[rel=prefetch]")).map((e) => new URL(e.href).pathname)`
        )
        expect(prefetches).toContainEqual(
          expect.stringMatching(/\/gsp-[^./]+\.js/)
        )
        expect(prefetches).toContainEqual(
          expect.stringMatching(/\/gssp-[^./]+\.js/)
        )
        expect(prefetches).toContainEqual(
          expect.stringMatching(/\/other-page-[^./]+\.js/)
        )
        return 'yes'
      }, 'yes')
    })
  }

  it('should 404 for public file without basePath', async () => {
    const res = await fetchViaHTTP(appPort, '/data.txt')
    expect(res.status).toBe(404)
  })

  it('should serve public file with basePath correctly', async () => {
    const res = await fetchViaHTTP(appPort, `${basePath}/data.txt`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello world')
  })

  it('should rewrite with basePath by default', async () => {
    const html = await renderViaHTTP(appPort, `${basePath}/rewrite-1`)
    expect(html).toContain('getServerSideProps')
  })

  it('should not rewrite without basePath without disabling', async () => {
    const res = await fetchViaHTTP(appPort, '/rewrite-1')
    expect(res.status).toBe(404)
  })

  it('should not rewrite with basePath when set to false', async () => {
    // won't 404 as it matches the dynamic [slug] route
    const html = await renderViaHTTP(appPort, `${basePath}/rewrite-no-basePath`)
    expect(html).toContain('slug')
  })

  it('should rewrite without basePath when set to false', async () => {
    const html = await renderViaHTTP(appPort, '/rewrite-no-basePath')
    expect(html).toContain('hello from external')
  })

  it('should redirect with basePath by default', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/redirect-1`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(pathname).toBe(`${basePath}/somewhere-else`)
    expect(res.status).toBe(307)
  })

  it('should not redirect without basePath without disabling', async () => {
    const res = await fetchViaHTTP(appPort, '/redirect-1', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(404)
  })

  it('should not redirect with basePath when set to false', async () => {
    // won't 404 as it matches the dynamic [slug] route
    const html = await renderViaHTTP(appPort, `${basePath}/rewrite-no-basePath`)
    expect(html).toContain('slug')
  })

  it('should redirect without basePath when set to false', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/redirect-no-basepath',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(pathname).toBe('/another-destination')
    expect(res.status).toBe(307)
  })

  //
  it('should add header with basePath by default', async () => {
    const res = await fetchViaHTTP(appPort, `${basePath}/add-header`)
    expect(res.headers.get('x-hello')).toBe('world')
  })

  it('should not add header without basePath without disabling', async () => {
    const res = await fetchViaHTTP(appPort, '/add-header')
    expect(res.headers.get('x-hello')).toBe(null)
  })

  it('should not add header with basePath when set to false', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/add-header-no-basepath`
    )
    expect(res.headers.get('x-hello')).toBe(null)
  })

  it('should add header without basePath when set to false', async () => {
    const res = await fetchViaHTTP(appPort, '/add-header-no-basepath')
    expect(res.headers.get('x-hello')).toBe('world')
  })

  it('should not update URL for a 404', async () => {
    const browser = await webdriver(appPort, '/missing')
    const pathname = await browser.eval(() => window.location.pathname)
    expect(await browser.eval(() => window.next.router.asPath)).toBe('/missing')
    expect(pathname).toBe('/missing')
  })

  it('should handle 404 urls that start with basePath', async () => {
    const browser = await webdriver(appPort, `${basePath}hello`)
    expect(await browser.eval(() => window.next.router.asPath)).toBe(
      `${basePath}hello`
    )
    expect(await browser.eval(() => window.location.pathname)).toBe(
      `${basePath}hello`
    )
  })

  it('should navigate back to a non-basepath 404 that starts with basepath', async () => {
    const browser = await webdriver(appPort, `${basePath}hello`)
    await browser.eval(() => (window.navigationMarker = true))
    await browser.eval(() => window.next.router.push('/hello'))
    await browser.waitForElementByCss('#pathname')
    await browser.back()
    check(
      () => browser.eval(() => window.location.pathname),
      `${basePath}hello`
    )
    expect(await browser.eval(() => window.next.router.asPath)).toBe(
      `${basePath}hello`
    )
    expect(await browser.eval(() => window.navigationMarker)).toBe(true)
  })

  it('should update dynamic params after mount correctly', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello-dynamic`)
    const text = await browser.elementByCss('#slug').text()
    expect(text).toContain('slug: hello-dynamic')
  })

  it('should navigate to index page with getStaticProps', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.eval('window.beforeNavigate = "hi"')

    await browser.elementByCss('#index-gsp').click()
    await browser.waitForElementByCss('#prop')

    expect(await browser.eval('window.beforeNavigate')).toBe('hi')
    expect(await browser.elementByCss('#prop').text()).toBe('hello world')
    expect(await browser.elementByCss('#nested').text()).toBe('no')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
    expect(await browser.elementByCss('#pathname').text()).toBe('/')

    if (!dev) {
      const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
      hrefs.sort()

      expect(
        hrefs.map((href) =>
          new URL(href).pathname.replace(/\/_next\/data\/[^/]+/, '')
        )
      ).toEqual([
        `${basePath}/gsp.json`,
        `${basePath}/index.json`,
        `${basePath}/index/index.json`,
      ])
    }
  })

  it('should navigate to nested index page with getStaticProps', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.eval('window.beforeNavigate = "hi"')

    await browser.elementByCss('#nested-index-gsp').click()
    await browser.waitForElementByCss('#prop')

    expect(await browser.eval('window.beforeNavigate')).toBe('hi')
    expect(await browser.elementByCss('#prop').text()).toBe('hello world')
    expect(await browser.elementByCss('#nested').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
    expect(await browser.elementByCss('#pathname').text()).toBe('/index')

    if (!dev) {
      const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
      hrefs.sort()

      expect(
        hrefs.map((href) =>
          new URL(href).pathname.replace(/\/_next\/data\/[^/]+/, '')
        )
      ).toEqual([
        `${basePath}/gsp.json`,
        `${basePath}/index.json`,
        `${basePath}/index/index.json`,
      ])
    }
  })

  it('should work with nested folder with same name as basePath', async () => {
    const html = await renderViaHTTP(appPort, `${basePath}/docs/another`)
    expect(html).toContain('hello from another')

    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.eval('window.next.router.push("/docs/another")')

    await check(() => browser.elementByCss('p').text(), /hello from another/)
  })

  it('should work with normal dynamic page', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.elementByCss('#dynamic-link').click()
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /slug: first/
    )
  })

  it('should work with hash links', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.elementByCss('#hashlink').click()
    const url = new URL(await browser.eval(() => window.location.href))
    expect(url.pathname).toBe(`${basePath}/hello`)
    expect(url.hash).toBe('#hashlink')
  })

  it('should work with catch-all page', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.elementByCss('#catchall-link').click()
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /parts: hello\/world/
    )
  })

  it('should redirect trailing slash correctly', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/hello/`,
      {},
      { redirect: 'manual' }
    )
    expect(res.status).toBe(308)
    const { pathname } = new URL(res.headers.get('location'))
    expect(pathname).toBe(`${basePath}/hello`)
  })

  it('should redirect trailing slash on root correctly', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `${basePath}/`,
      {},
      { redirect: 'manual' }
    )
    expect(res.status).toBe(308)
    const { pathname } = new URL(res.headers.get('location'))
    expect(pathname).toBe(`${basePath}`)
  })

  it('should navigate an absolute url', async () => {
    const browser = await webdriver(appPort, `${basePath}/absolute-url`)
    await browser.waitForElementByCss('#absolute-link').click()
    await check(
      () => browser.eval(() => window.location.origin),
      'https://vercel.com'
    )
  })

  it('should navigate an absolute local url with basePath', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/absolute-url-basepath?port=${appPort}`
    )
    await browser.eval(() => (window._didNotNavigate = true))
    await browser.waitForElementByCss('#absolute-link').click()
    const text = await browser
      .waitForElementByCss('#something-else-page')
      .text()

    expect(text).toBe('something else')
    expect(await browser.eval(() => window._didNotNavigate)).toBe(true)
  })

  it('should navigate an absolute local url without basePath', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/absolute-url-no-basepath?port=${appPort}`
    )
    await browser.waitForElementByCss('#absolute-link').click()
    await check(
      () => browser.eval(() => location.pathname),
      '/rewrite-no-basepath'
    )
    const text = await browser.elementByCss('body').text()

    expect(text).toBe('hello from external')
  })

  it('should 404 when manually adding basePath with <Link>', async () => {
    const browser = await webdriver(
      appPort,
      `${basePath}/invalid-manual-basepath`
    )
    await browser.eval('window.beforeNav = "hi"')
    await browser.elementByCss('#other-page-link').click()

    await check(() => browser.eval('window.beforeNav'), {
      test(content) {
        return content !== 'hi'
      },
    })

    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('This page could not be found')
  })

  it('should 404 when manually adding basePath with router.push', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.eval('window.beforeNav = "hi"')
    await browser.eval(`window.next.router.push("${basePath}/other-page")`)

    await check(() => browser.eval('window.beforeNav'), {
      test(content) {
        return content !== 'hi'
      },
    })

    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('This page could not be found')
  })

  it('should 404 when manually adding basePath with router.replace', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.eval('window.beforeNav = "hi"')
    await browser.eval(`window.next.router.replace("${basePath}/other-page")`)

    await check(() => browser.eval('window.beforeNav'), {
      test(content) {
        return content !== 'hi'
      },
    })

    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('This page could not be found')
  })

  it('should show the hello page under the /docs prefix', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    try {
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Hello World')
    } finally {
      await browser.close()
    }
  })

  it('should have correct router paths on first load of /', async () => {
    const browser = await webdriver(appPort, `${basePath}`)
    await browser.waitForElementByCss('#pathname')
    const pathname = await browser.elementByCss('#pathname').text()
    expect(pathname).toBe('/')
    const asPath = await browser.elementByCss('#as-path').text()
    expect(asPath).toBe('/')
  })

  it('should have correct router paths on first load of /hello', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.waitForElementByCss('#pathname')
    const pathname = await browser.elementByCss('#pathname').text()
    expect(pathname).toBe('/hello')
    const asPath = await browser.elementByCss('#as-path').text()
    expect(asPath).toBe('/hello')
  })

  it('should fetch data for getStaticProps without reloading', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.eval('window.beforeNavigate = true')
    await browser.elementByCss('#gsp-link').click()
    await browser.waitForElementByCss('#gsp')
    expect(await browser.eval('window.beforeNavigate')).toBe(true)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.hello).toBe('world')

    const pathname = await browser.elementByCss('#pathname').text()
    expect(pathname).toBe('/gsp')
  })

  it('should fetch data for getServerSideProps without reloading', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    await browser.eval('window.beforeNavigate = true')
    await browser.elementByCss('#gssp-link').click()
    await browser.waitForElementByCss('#gssp')
    expect(await browser.eval('window.beforeNavigate')).toBe(true)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.hello).toBe('world')

    const pathname = await browser.elementByCss('#pathname').text()
    const asPath = await browser.elementByCss('#asPath').text()
    expect(pathname).toBe('/gssp')
    expect(asPath).toBe('/gssp')
  })

  it('should have correct href for a link', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    const href = await browser.elementByCss('a').getAttribute('href')
    const { pathname } = url.parse(href)
    expect(pathname).toBe(`${basePath}/other-page`)
  })

  it('should have correct href for a link to /', async () => {
    const browser = await webdriver(appPort, `${basePath}/link-to-root`)
    const href = await browser.elementByCss('#link-back').getAttribute('href')
    const { pathname } = url.parse(href)
    expect(pathname).toBe(`${basePath}`)
  })

  it('should show 404 for page not under the /docs prefix', async () => {
    const text = await renderViaHTTP(appPort, '/hello')
    expect(text).not.toContain('Hello World')
    expect(text).toContain('This page could not be found')
  })

  it('should show the other-page page under the /docs prefix', async () => {
    const browser = await webdriver(appPort, `${basePath}/other-page`)
    try {
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Hello Other')
    } finally {
      await browser.close()
    }
  })

  it('should have basePath field on Router', async () => {
    const html = await renderViaHTTP(appPort, `${basePath}/hello`)
    const $ = cheerio.load(html)
    expect($('#base-path').text()).toBe(`${basePath}`)
  })

  it('should navigate to the page without refresh', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    try {
      await browser.eval('window.itdidnotrefresh = "hello"')
      const text = await browser
        .elementByCss('#other-page-link')
        .click()
        .waitForElementByCss('#other-page-title')
        .elementByCss('h1')
        .text()

      expect(text).toBe('Hello Other')
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    try {
      await browser.eval('window._clearEventLog()')
      await browser
        .elementByCss('#other-page-link')
        .click()
        .waitForElementByCss('#other-page-title')

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['routeChangeStart', `${basePath}/other-page`, { shallow: false }],
        ['beforeHistoryChange', `${basePath}/other-page`, { shallow: false }],
        ['routeChangeComplete', `${basePath}/other-page`, { shallow: false }],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events for hash changes', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    try {
      await browser.eval('window._clearEventLog()')
      await browser.elementByCss('#hash-change').click()

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['hashChangeStart', `${basePath}/hello#some-hash`, { shallow: false }],
        [
          'hashChangeComplete',
          `${basePath}/hello#some-hash`,
          { shallow: false },
        ],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events for cancelled routes', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    try {
      await browser.eval('window._clearEventLog()')
      await browser
        .elementByCss('#slow-route')
        .click()
        .elementByCss('#other-page-link')
        .click()
        .waitForElementByCss('#other-page-title')

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['routeChangeStart', `${basePath}/slow-route`, { shallow: false }],
        [
          'routeChangeError',
          'Route Cancelled',
          true,
          `${basePath}/slow-route`,
          { shallow: false },
        ],
        ['routeChangeStart', `${basePath}/other-page`, { shallow: false }],
        ['beforeHistoryChange', `${basePath}/other-page`, { shallow: false }],
        ['routeChangeComplete', `${basePath}/other-page`, { shallow: false }],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events for failed route change', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello`)
    try {
      await browser.eval('window._clearEventLog()')
      await browser.elementByCss('#error-route').click()

      await waitFor(2000)

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['routeChangeStart', `${basePath}/error-route`, { shallow: false }],
        [
          'routeChangeError',
          'Failed to load static props',
          null,
          `${basePath}/error-route`,
          { shallow: false },
        ],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should allow URL query strings without refresh', async () => {
    const browser = await webdriver(appPort, `${basePath}/hello?query=true`)
    try {
      await browser.eval('window.itdidnotrefresh = "hello"')
      await new Promise((resolve, reject) => {
        // Timeout of EventSource created in setupPing()
        // (on-demand-entries-utils.js) is 5000 ms (see #13132, #13560)
        setTimeout(resolve, 10000)
      })
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')

      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('/hello')
      expect(await browser.eval('window.location.pathname')).toBe(
        `${basePath}/hello`
      )
      expect(await browser.eval('window.location.search')).toBe('?query=true')

      if (dev) {
        expect(await hasRedbox(browser, false)).toBe(false)
      }
    } finally {
      await browser.close()
    }
  })

  it('should allow URL query strings on index without refresh', async () => {
    const browser = await webdriver(appPort, `${basePath}?query=true`)
    try {
      await browser.eval('window.itdidnotrefresh = "hello"')
      await new Promise((resolve, reject) => {
        // Timeout of EventSource created in setupPing()
        // (on-demand-entries-utils.js) is 5000 ms (see #13132, #13560)
        setTimeout(resolve, 10000)
      })
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')

      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('/')
      expect(await browser.eval('window.location.pathname')).toBe(basePath)
      expect(await browser.eval('window.location.search')).toBe('?query=true')

      if (dev) {
        expect(await hasRedbox(browser, false)).toBe(false)
      }
    } finally {
      await browser.close()
    }
  })

  it('should correctly replace state when same asPath but different url', async () => {
    const browser = await webdriver(appPort, `${basePath}`)
    try {
      await browser.elementByCss('#hello-link').click()
      await browser.waitForElementByCss('#something-else-link')
      await browser.elementByCss('#something-else-link').click()
      await browser.waitForElementByCss('#something-else-page')
      await browser.back()
      await browser.waitForElementByCss('#index-page')
      await browser.forward()
      await browser.waitForElementByCss('#something-else-page')
    } finally {
      await browser.close()
    }
  })
}

describe('basePath development', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(join(__dirname, '..'), appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    })
  })
  afterAll(() => killApp(app))

  runTests(true)
})

describe('basePath production', () => {
  beforeAll(async () => {
    await nextBuild(appDir, [], {
      env: {
        EXTERNAL_APP: `http://localhost:${externalApp.address().port}`,
      },
    })
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  runTests()

  it('should respect basePath in amphtml link rel', async () => {
    const html = await renderViaHTTP(appPort, `${basePath}/amp-hybrid`)
    const $ = cheerio.load(html)
    const expectedAmpHtmlUrl = `${basePath}/amp-hybrid.amp`
    expect($('link[rel=amphtml]').first().attr('href')).toBe(expectedAmpHtmlUrl)
  })
})

describe('multi-level basePath development', () => {
  beforeAll(async () => {
    basePath = '/hello/world'
    nextConfig.replace(`basePath: '/docs'`, `basePath: '/hello/world'`)
    appPort = await findPort()
    app = await launchApp(join(__dirname, '..'), appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    })
  })
  afterAll(async () => {
    basePath = '/docs'
    nextConfig.replace(`basePath: '/hello/world'`, `basePath: '/docs'`)
    await killApp(app)
  })

  runTests(true)
})

describe('multi-level basePath production', () => {
  beforeAll(async () => {
    basePath = '/hello/world'
    nextConfig.replace(`basePath: '/docs'`, `basePath: '/hello/world'`)
    await nextBuild(appDir, [], {
      env: {
        EXTERNAL_APP: `http://localhost:${externalApp.address().port}`,
      },
    })
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    basePath = '/docs'
    nextConfig.replace(`basePath: '/hello/world'`, `basePath: '/docs'`)
    await killApp(app)
  })

  runTests()
})

describe('basePath serverless', () => {
  beforeAll(async () => {
    await nextConfig.replace(
      '// replace me',
      `target: 'experimental-serverless-trace',`
    )
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
    await nextConfig.restore()
  })

  runTests()

  it('should always strip basePath in serverless-loader', async () => {
    const appPort = await findPort()
    const app = await initNextServerScript(
      join(appDir, 'server.js'),
      /ready on/,
      {
        ...process.env,
        PORT: appPort,
      }
    )

    const html = await renderViaHTTP(appPort, '/docs/gssp')
    await killApp(app)

    const $ = cheerio.load(html)

    expect($('#pathname').text()).toBe('/gssp')
    expect($('#asPath').text()).toBe('/gssp')
  })
})
