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

  if ((global as any).isNextDeploy) {
    // TODO-APP: re-enable after Prerenders are handled on deploy
    it('should skip for deploy temporarily', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(__dirname),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
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
      it('should not include edge api routes and edge ssr routes into dev middleware manifest', async () => {
        const res = await fetchViaHTTP(
          next.url,
          `/_next/static/${next.buildId}/_devMiddlewareManifest.json`
        )
        const devMiddlewareManifest = await res.json()
        expect(devMiddlewareManifest).toEqual([])
      })

      it('should sort edge SSR routes correctly', async () => {
        const res = await fetchViaHTTP(next.url, `/edge/foo`)
        const html = await res.text()

        // /edge/foo should be caught before /edge/[id]
        expect(html).toContain(`to /edge/[id]`)
      })

      it('should be able to navigate between edge SSR routes without any errors', async () => {
        const res = await fetchViaHTTP(next.url, `/edge/foo`)
        const html = await res.text()

        // /edge/foo should be caught before /edge/[id]
        expect(html).toContain(`to /edge/[id]`)

        const browser = await webdriver(context.appPort, '/edge/foo')

        await browser.waitForElementByCss('a').click()

        // on /edge/[id]
        await check(
          () => browser.eval('document.documentElement.innerHTML'),
          /to \/edge\/foo/
        )

        await browser.waitForElementByCss('a').click()

        // on /edge/foo
        await check(
          () => browser.eval('document.documentElement.innerHTML'),
          /to \/edge\/\[id\]/
        )

        expect(context.stdout).not.toContain('self is not defined')
        expect(context.stderr).not.toContain('self is not defined')
      })

      it.skip('should support client side navigation to ssr rsc pages', async () => {
        let flightRequest = null

        const browser = await webdriver(context.appPort, '/node', {
          beforePageLoad(page) {
            page.on('request', (request) => {
              return request.allHeaders().then((headers) => {
                if (headers['RSC'.toLowerCase()] === '1') {
                  flightRequest = request.url()
                }
              })
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
        expect(flightRequest).toContain('/node-rsc-ssr')
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

      it('should not consume server.js file extension', async () => {
        const { status } = await fetchViaHTTP(
          context.appPort,
          '/legacy-extension'
        )
        expect(status).toBe(404)
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
                files: [
                  'server/edge-runtime-webpack.js',
                  'server/pages/api/hello.js',
                ],
                name: 'pages/api/hello',
                page: '/api/hello',
                matchers: [
                  { regexp: '^/api/hello$', originalSource: '/api/hello' },
                ],
                wasm: [],
              },
              '/api/edge': {
                files: [
                  'server/edge-runtime-webpack.js',
                  'server/pages/api/edge.js',
                ],
                name: 'pages/api/edge',
                page: '/api/edge',
                matchers: [
                  { regexp: '^/api/edge$', originalSource: '/api/edge' },
                ],
                wasm: [],
              },
            },
          })
        }
      })

      it('should be possible to switch between runtimes in API routes', async () => {
        await check(
          () => renderViaHTTP(next.url, '/api/switch-in-dev'),
          'server response'
        )

        // Edge
        await next.patchFile(
          'pages/api/switch-in-dev.js',
          `
          export const config = {
            runtime: 'edge',
          }

          export default () => new Response('edge response')
          `
        )
        await check(
          () => renderViaHTTP(next.url, '/api/switch-in-dev'),
          'edge response'
        )

        // Server
        await next.patchFile(
          'pages/api/switch-in-dev.js',
          `
          export default function (req, res) {
            res.send('server response again')
          }
          `
        )
        await check(
          () => renderViaHTTP(next.url, '/api/switch-in-dev'),
          'server response again'
        )

        // Edge
        await next.patchFile(
          'pages/api/switch-in-dev.js',
          `
          export const config = {
            runtime: 'edge',
          }

          export default () => new Response('edge response again')
          `
        )
        await check(
          () => renderViaHTTP(next.url, '/api/switch-in-dev'),
          'edge response again'
        )
      })

      it('should be possible to switch between runtimes in pages', async () => {
        await check(
          () => renderViaHTTP(next.url, '/switch-in-dev'),
          /Hello from edge page/
        )

        // Server
        await next.patchFile(
          'pages/switch-in-dev.js',
          `
          export default function Page() {
            return <p>Hello from server page</p>
          }
          `
        )
        await check(
          () => renderViaHTTP(next.url, '/switch-in-dev'),
          /Hello from server page/
        )

        // Edge
        await next.patchFile(
          'pages/switch-in-dev.js',
          `
      export default function Page() {
        return <p>Hello from edge page again</p>
      }

      export const config = {
        runtime: 'experimental-edge',
      }
      `
        )
        await check(
          () => renderViaHTTP(next.url, '/switch-in-dev'),
          /Hello from edge page again/
        )

        // Server
        await next.patchFile(
          'pages/switch-in-dev.js',
          `
            export default function Page() {
              return <p>Hello from server page again</p>
            }
            `
        )
        await check(
          () => renderViaHTTP(next.url, '/switch-in-dev'),
          /Hello from server page again/
        )
      })

      // Doesn't work, see https://github.com/vercel/next.js/pull/39327
      it.skip('should be possible to switch between runtimes with same content', async () => {
        const fileContent = await next.readFile(
          'pages/api/switch-in-dev-same-content.js'
        )
        console.log({ fileContent })
        await check(
          () => renderViaHTTP(next.url, '/api/switch-in-dev-same-content'),
          'server response'
        )

        // Edge
        await next.patchFile(
          'pages/api/switch-in-dev-same-content.js',
          `
          export const config = {
            runtime: 'edge',
          }

          export default () => new Response('edge response')
          `
        )
        await check(
          () => renderViaHTTP(next.url, '/api/switch-in-dev-same-content'),
          'edge response'
        )

        // Server - same content as first compilation of the server runtime version
        await next.patchFile(
          'pages/api/switch-in-dev-same-content.js',
          fileContent
        )
        await check(
          () => renderViaHTTP(next.url, '/api/switch-in-dev-same-content'),
          'server response'
        )
      })

      // TODO: investigate these failures
      it.skip('should recover from syntax error when using edge runtime', async () => {
        await check(
          () => renderViaHTTP(next.url, '/api/syntax-error-in-dev'),
          'edge response'
        )

        // Syntax error
        await next.patchFile(
          'pages/api/syntax-error-in-dev.js',
          `
        export const config = {
          runtime: 'edge',
        }

        export default  => new Response('edge response')
        `
        )
        await check(
          () => renderViaHTTP(next.url, '/api/syntax-error-in-dev'),
          /Unexpected token/
        )

        // Fix syntax error
        await next.patchFile(
          'pages/api/syntax-error-in-dev.js',
          `
          export default () => new Response('edge response again')

          export const config = {
            runtime: 'edge',
          }

        `
        )
        await check(
          () => renderViaHTTP(next.url, '/api/syntax-error-in-dev'),
          'edge response again'
        )
      })

      it.skip('should not crash the dev server when invalid runtime is configured', async () => {
        await check(
          () => renderViaHTTP(next.url, '/invalid-runtime'),
          /Hello from page without errors/
        )

        // Invalid runtime type
        await next.patchFile(
          'pages/invalid-runtime.js',
          `
          export default function Page() {
            return <p>Hello from page with invalid type</p>
          }

          export const config = {
            runtime: 10,
          }
            `
        )
        await check(
          () => renderViaHTTP(next.url, '/invalid-runtime'),
          /Hello from page with invalid type/
        )
        expect(next.cliOutput).toInclude(
          'The `runtime` config must be a string. Please leave it empty or choose one of:'
        )

        // Invalid runtime
        await next.patchFile(
          'pages/invalid-runtime.js',
          `
            export default function Page() {
              return <p>Hello from page with invalid runtime</p>
            }

            export const config = {
              runtime: "asd"
            }
              `
        )
        await check(
          () => renderViaHTTP(next.url, '/invalid-runtime'),
          /Hello from page with invalid runtime/
        )
        expect(next.cliOutput).toInclude(
          'Provided runtime "asd" is not supported. Please leave it empty or choose one of:'
        )

        // Fix the runtime
        await next.patchFile(
          'pages/invalid-runtime.js',
          `
        export default function Page() {
          return <p>Hello from page without errors</p>
        }

        export const config = {
          runtime: 'experimental-edge',
        }

        `
        )
        await check(
          () => renderViaHTTP(next.url, '/invalid-runtime'),
          /Hello from page without errors/
        )
      })

      it.skip('should give proper errors for invalid runtime in app dir', async () => {
        // Invalid runtime
        await next.patchFile(
          'app/app-invalid-runtime/page.js',
          `
          export default function Page() {
            return <p>Hello from app</p>
          }
          export const runtime = 'invalid-runtime'
          `
        )
        await check(
          () => renderViaHTTP(next.url, '/app-invalid-runtime'),
          /Hello from app/
        )
        expect(next.cliOutput).toInclude(
          'Provided runtime "invalid-runtime" is not supported. Please leave it empty or choose one of:'
        )

        await next.patchFile(
          'app/app-invalid-runtime/page.js',
          `
          export default function Page() {
            return <p>Hello from app</p>
          }`
        )
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

      it('should build /app-valid-runtime as a dynamic page with the edge runtime', async () => {
        await testRoute(context.appPort, '/app-valid-runtime', {
          isStatic: false,
          isEdge: true,
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
        await testRoute(context.appPort, '/rewrite/edge', {
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

        // Rewrite should also work
        response = await fetchViaHTTP(context.appPort, 'rewrite/api/edge')
        text = await response.text()
        expect(text).toMatch(/Returned by Edge API Route .+\/api\/edge/)

        if (!(global as any).isNextDeploy) {
          const manifest = await readJson(
            join(context.appDir, '.next/server/middleware-manifest.json')
          )
          expect(manifest).toMatchObject({
            functions: {
              '/api/hello': {
                files: [
                  'prerender-manifest.js',
                  'server/edge-runtime-webpack.js',
                  'server/pages/api/hello.js',
                ],
                name: 'pages/api/hello',
                page: '/api/hello',
                matchers: [
                  { regexp: '^/api/hello$', originalSource: '/api/hello' },
                ],
                wasm: [],
              },
              '/api/edge': {
                files: [
                  'prerender-manifest.js',
                  'server/edge-runtime-webpack.js',
                  'server/pages/api/edge.js',
                ],
                name: 'pages/api/edge',
                page: '/api/edge',
                matchers: [
                  { regexp: '^/api/edge$', originalSource: '/api/edge' },
                ],
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
              request.allHeaders().then((headers) => {
                if (headers['RSC'.toLowerCase()] === '1') {
                  flightRequest = request.url()
                }
              })
            })
          },
        })

        await browser.waitForElementByCss('#link-node-rsc-ssr').click()

        expect(await browser.elementByCss('body').text()).toContain(
          'This is a SSR RSC page.'
        )
        expect(flightRequest).toContain('/node-rsc-ssr')
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
