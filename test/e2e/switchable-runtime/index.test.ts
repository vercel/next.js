/* eslint-env jest */
import webdriver from 'next-webdriver'
import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, fetchViaHTTP, renderViaHTTP, waitFor } from 'next-test-utils'

import { readJson } from 'fs-extra'

function splitLines(text) {
  return text
    .split(/\r?\n/g)
    .map((str) => str.trim())
    .filter(Boolean)
}

async function testRoute(appPort, url, { isStatic, isEdge }) {
  const html1 = await renderViaHTTP(appPort, url)
  const renderedAt1 = +html1.match(/Time: (\d+)/)[1]
  expect(html1).toContain(`Runtime: ${isEdge ? 'Edge' : 'Node.js'}`)

  const html2 = await renderViaHTTP(appPort, url)
  const renderedAt2 = +html2.match(/Time: (\d+)/)[1]
  expect(html2).toContain(`Runtime: ${isEdge ? 'Edge' : 'Node.js'}`)

  if (isStatic) {
    // TODO: enable static opt tests
    // Should not be re-rendered, some timestamp should be returned.
    // expect(renderedAt1).toBe(renderedAt2)
  } else {
    // Should be re-rendered.
    expect(renderedAt1).toBeLessThan(renderedAt2)
  }
}

describe('Switchable runtime', () => {
  let next: NextInstance
  let context

  beforeAll(async () => {
    next = await createNext({
      files: {
        app: new FileRef(join(__dirname, './app')),
        pages: new FileRef(join(__dirname, './pages')),
        utils: new FileRef(join(__dirname, './utils')),
        'next.config.js': new FileRef(join(__dirname, './next.config.js')),
      },
      dependencies: {
        react: 'experimental',
        'react-dom': 'experimental',
      },
    })
    context = {
      appPort: next.url,
      appDir: next.testDir,
      stdout: '',
      stderr: '',
    }
  })
  afterAll(() => next.destroy())

  if ((global as any).isNextDev) {
    describe('Switchable runtime (dev)', () => {
      it.skip('should support client side navigation to ssr rsc pages', async () => {
        let flightRequest = null

        const browser = await webdriver(context.appPort, '/node', {
          beforePageLoad(page) {
            page.on('request', (request) => {
              const url = request.url()
              if (/\?__flight__=1/.test(url)) {
                flightRequest = url
              }
            })
          },
        })

        await browser
          .waitForElementByCss('#link-node-rsc-ssr')
          .click()
          .waitForElementByCss('.node-rsc-ssr')

        await check(
          () => browser.eval('document.documentElement.innerHTML'),
          /This is a SSR RSC page/
        )
        expect(flightRequest).toContain('/node-rsc-ssr?__flight__=1')
      })

      it.skip('should support client side navigation to ssg rsc pages', async () => {
        const browser = await webdriver(context.appPort, '/node')

        await browser
          .waitForElementByCss('#link-node-rsc-ssg')
          .click()
          .waitForElementByCss('.node-rsc-ssg')

        await check(
          () => browser.eval('document.documentElement.innerHTML'),
          /This is a SSG RSC page/
        )
      })

      it.skip('should support client side navigation to static rsc pages', async () => {
        const browser = await webdriver(context.appPort, '/node')

        await browser
          .waitForElementByCss('#link-node-rsc')
          .click()
          .waitForElementByCss('.node-rsc')

        await check(
          () => browser.eval('document.documentElement.innerHTML'),
          /This is a static RSC page/
        )
      })

      it('should build /api/hello and /api/edge as an api route with edge runtime', async () => {
        let response = await fetchViaHTTP(context.appPort, '/api/hello')
        let text = await response.text()
        expect(text).toMatch(/Hello from .+\/api\/hello/)

        response = await fetchViaHTTP(context.appPort, '/api/edge')
        text = await response.text()
        expect(text).toMatch(/Returned by Edge API Route .+\/api\/edge/)

        if (!(global as any).isNextDeploy) {
          const manifest = await readJson(
            join(context.appDir, '.next/server/middleware-manifest.json')
          )
          expect(manifest).toMatchObject({
            functions: {
              '/api/hello': {
                env: [],
                files: [
                  'server/edge-runtime-webpack.js',
                  'server/pages/api/hello.js',
                ],
                name: 'pages/api/hello',
                page: '/api/hello',
                regexp: '^/api/hello$',
                wasm: [],
              },
              '/api/edge': {
                env: [],
                files: [
                  'server/edge-runtime-webpack.js',
                  'server/pages/api/edge.js',
                ],
                name: 'pages/api/edge',
                page: '/api/edge',
                regexp: '^/api/edge$',
                wasm: [],
              },
            },
          })
        }
      })
    })
  } else {
    describe('Switchable runtime (prod)', () => {
      it('should build /static as a static page with the nodejs runtime', async () => {
        await testRoute(context.appPort, '/static', {
          isStatic: true,
          isEdge: false,
        })
      })

      it.skip('should build /node as a static page with the nodejs runtime', async () => {
        await testRoute(context.appPort, '/node', {
          isStatic: true,
          isEdge: false,
        })
      })

      it('should build /node-ssr as a dynamic page with the nodejs runtime', async () => {
        await testRoute(context.appPort, '/node-ssr', {
          isStatic: false,
          isEdge: false,
        })
      })

      it.skip('should build /node-ssg as a static page with the nodejs runtime', async () => {
        await testRoute(context.appPort, '/node-ssg', {
          isStatic: true,
          isEdge: false,
        })
      })

      it.skip('should build /node-rsc as a static page with the nodejs runtime', async () => {
        await testRoute(context.appPort, '/node-rsc', {
          isStatic: true,
          isEdge: false,
        })
      })

      // FIXME: rsc hydration
      it.skip('should build /node-rsc-ssr as a dynamic page with the nodejs runtime', async () => {
        await testRoute(context.appPort, '/node-rsc-ssr', {
          isStatic: false,
          isEdge: false,
        })
      })

      // FIXME: rsc hydration
      it.skip('should build /node-rsc-ssg as a static page with the nodejs runtime', async () => {
        await testRoute(context.appPort, '/node-rsc-ssg', {
          isStatic: true,
          isEdge: false,
        })
      })

      // FIXME: rsc hydration
      it.skip('should build /node-rsc-isr as an isr page with the nodejs runtime', async () => {
        const html1 = await renderViaHTTP(context.appPort, '/node-rsc-isr')
        const renderedAt1 = +html1.match(/Time: (\d+)/)[1]
        expect(html1).toContain('Runtime: Node.js')

        const html2 = await renderViaHTTP(context.appPort, '/node-rsc-isr')
        const renderedAt2 = +html2.match(/Time: (\d+)/)[1]
        expect(html2).toContain('Runtime: Node.js')

        expect(renderedAt1).toBe(renderedAt2)

        // Trigger a revalidation after 3s.
        await waitFor(4000)
        await renderViaHTTP(context.appPort, '/node-rsc-isr')

        await check(async () => {
          const html3 = await renderViaHTTP(context.appPort, '/node-rsc-isr')
          const renderedAt3 = +html3.match(/Time: (\d+)/)[1]
          return renderedAt2 < renderedAt3
            ? 'success'
            : `${renderedAt2} should be less than ${renderedAt3}`
        }, 'success')
      })

      it('should build /edge as a dynamic page with the edge runtime', async () => {
        await testRoute(context.appPort, '/edge', {
          isStatic: false,
          isEdge: true,
        })
      })

      // TODO: edge rsc in app dir
      it.skip('should build /edge-rsc as a dynamic page with the edge runtime', async () => {
        await testRoute(context.appPort, '/edge-rsc', {
          isStatic: false,
          isEdge: true,
        })
      })

      it('should build /api/hello and /api/edge as an api route with edge runtime', async () => {
        let response = await fetchViaHTTP(context.appPort, '/api/hello')
        let text = await response.text()
        expect(text).toMatch(/Hello from .+\/api\/hello/)

        response = await fetchViaHTTP(context.appPort, '/api/edge')
        text = await response.text()
        expect(text).toMatch(/Returned by Edge API Route .+\/api\/edge/)

        if (!(global as any).isNextDeploy) {
          const manifest = await readJson(
            join(context.appDir, '.next/server/middleware-manifest.json')
          )
          expect(manifest).toMatchObject({
            functions: {
              '/api/hello': {
                env: [],
                files: [
                  'server/edge-runtime-webpack.js',
                  'server/pages/api/hello.js',
                ],
                name: 'pages/api/hello',
                page: '/api/hello',
                regexp: '^/api/hello$',
                wasm: [],
              },
              '/api/edge': {
                env: [],
                files: [
                  'server/edge-runtime-webpack.js',
                  'server/pages/api/edge.js',
                ],
                name: 'pages/api/edge',
                page: '/api/edge',
                regexp: '^/api/edge$',
                wasm: [],
              },
            },
          })
        }
      })

      it.skip('should display correct tree view with page types in terminal', async () => {
        const stdoutLines = splitLines(context.stdout).filter((line) =>
          /^[┌├└/]/.test(line)
        )
        const expectedOutputLines = splitLines(`
      ┌   /_app
      ├ ○ /404
      ├ ℇ /api/hello
      ├ λ /api/node
      ├ ℇ /edge
      ├ ℇ /edge-rsc
      ├ ○ /node
      ├ ● /node-rsc
      ├ ● /node-rsc-isr
      ├ ● /node-rsc-ssg
      ├ λ /node-rsc-ssr
      ├ ● /node-ssg
      ├ λ /node-ssr
      └ ○ /static
      `)

        const mappedOutputLines = expectedOutputLines.map((_line, index) => {
          /** @type {string} */
          const str = stdoutLines[index]
          const beginningOfPath = str.indexOf('/')
          const endOfPath = str.indexOf(' ', beginningOfPath)
          return str.slice(0, endOfPath)
        })

        expect(mappedOutputLines).toEqual(expectedOutputLines)
      })

      // TODO: static opt
      it.skip('should prefetch data for static pages', async () => {
        const dataRequests = []

        const browser = await webdriver(context.appPort, '/node', {
          beforePageLoad(page) {
            page.on('request', (request) => {
              const url = request.url()
              if (/\.json$/.test(url)) {
                dataRequests.push(url.split('/').pop())
              }
            })
          },
        })

        await browser.eval('window.beforeNav = 1')

        for (const data of [
          'node-rsc.json',
          'node-rsc-ssg.json',
          'node-rsc-isr.json',
          'node-ssg.json',
        ]) {
          expect(dataRequests).toContain(data)
        }
      })

      it.skip('should support client side navigation to ssr rsc pages', async () => {
        let flightRequest = null

        const browser = await webdriver(context.appPort, '/node', {
          beforePageLoad(page) {
            page.on('request', (request) => {
              const url = request.url()
              if (/\?__flight__=1/.test(url)) {
                flightRequest = url
              }
            })
          },
        })

        await browser.waitForElementByCss('#link-node-rsc-ssr').click()

        expect(await browser.elementByCss('body').text()).toContain(
          'This is a SSR RSC page.'
        )
        expect(flightRequest).toContain('/node-rsc-ssr?__flight__=1')
      })

      it.skip('should support client side navigation to ssg rsc pages', async () => {
        const browser = await webdriver(context.appPort, '/node')

        await browser.waitForElementByCss('#link-node-rsc-ssg').click()
        expect(await browser.elementByCss('body').text()).toContain(
          'This is a SSG RSC page.'
        )
      })

      it.skip('should support client side navigation to static rsc pages', async () => {
        const browser = await webdriver(context.appPort, '/node')

        await browser.waitForElementByCss('#link-node-rsc').click()
        expect(await browser.elementByCss('body').text()).toContain(
          'This is a static RSC page.'
        )
      })

      it('should support etag header in the web server', async () => {
        const res = await fetchViaHTTP(context.appPort, '/edge', '', {
          headers: {
            // Make sure the result is static so an etag can be generated.
            'User-Agent': 'Googlebot',
          },
        })
        expect(res.headers.get('ETag')).toBeDefined()
      })
    })
  }
})
