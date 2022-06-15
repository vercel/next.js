/* eslint-env jest */
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  check,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  fetchViaHTTP,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import { readJson } from 'fs-extra'

const appDir = join(__dirname, '../switchable-runtime')

function splitLines(text) {
  return text
    .split(/\r?\n/g)
    .map((str) => str.trim())
    .filter(Boolean)
}

function getOccurrence(text, matcher) {
  return (text.match(matcher) || []).length
}

function flight(context) {
  describe('flight response', () => {
    it('should not contain _app.js in flight response (node)', async () => {
      const html = await renderViaHTTP(context.appPort, '/node-rsc')
      const flightResponse = await renderViaHTTP(
        context.appPort,
        '/node-rsc?__flight__=1'
      )
      expect(
        getOccurrence(html, new RegExp(`class="app-client-root"`, 'g'))
      ).toBe(1)
      expect(
        getOccurrence(
          flightResponse,
          new RegExp(`"className":\\s*"app-client-root"`, 'g')
        )
      ).toBe(0)
    })
  })
}

async function testRoute(appPort, url, { isStatic, isEdge }) {
  const html1 = await renderViaHTTP(appPort, url)
  const renderedAt1 = +html1.match(/Time: (\d+)/)[1]
  expect(html1).toContain(`Runtime: ${isEdge ? 'Edge' : 'Node.js'}`)

  const html2 = await renderViaHTTP(appPort, url)
  const renderedAt2 = +html2.match(/Time: (\d+)/)[1]
  expect(html2).toContain(`Runtime: ${isEdge ? 'Edge' : 'Node.js'}`)

  if (isStatic) {
    // Should not be re-rendered, some timestamp should be returned.
    expect(renderedAt1).toBe(renderedAt2)
  } else {
    // Should be re-rendered.
    expect(renderedAt1).toBeLessThan(renderedAt2)
  }
}

describe('Switchable runtime (prod)', () => {
  const context = { appDir }

  beforeAll(async () => {
    context.appPort = await findPort()
    const { stdout, stderr } = await nextBuild(context.appDir, [], {
      stderr: true,
      stdout: true,
    })
    context.stdout = stdout
    context.stderr = stderr
    context.server = await nextStart(context.appDir, context.appPort)
  })
  afterAll(async () => {
    await killApp(context.server)
  })

  flight(context)

  it('should build /static as a static page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/static', {
      isStatic: true,
      isEdge: false,
    })
  })

  it('should build /node as a static page with the nodejs runtime', async () => {
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

  it('should build /node-ssg as a static page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node-ssg', {
      isStatic: true,
      isEdge: false,
    })
  })

  it('should build /node-rsc as a static page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node-rsc', {
      isStatic: true,
      isEdge: false,
    })

    const html = await renderViaHTTP(context.appPort, '/node-rsc')
    expect(html).toContain('data-title="node-rsc"')
  })

  it('should build /node-rsc-ssr as a dynamic page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node-rsc-ssr', {
      isStatic: false,
      isEdge: false,
    })
  })

  it('should build /node-rsc-ssg as a static page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node-rsc-ssg', {
      isStatic: true,
      isEdge: false,
    })
  })

  it('should build /node-rsc-isr as an isr page with the nodejs runtime', async () => {
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

  it('should build /edge-rsc as a dynamic page with the edge runtime', async () => {
    await testRoute(context.appPort, '/edge-rsc', {
      isStatic: false,
      isEdge: true,
    })
  })

  it('should build /api/hello as an api route with edge runtime', async () => {
    const response = await fetchViaHTTP(context.appPort, '/api/hello')
    const text = await response.text()
    expect(text).toMatch(/Hello from .+\/api\/hello/)

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
      },
    })
  })

  it('should display correct tree view with page types in terminal', async () => {
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

  it('should prefetch data for static pages', async () => {
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

  it('should support client side navigation to ssr rsc pages', async () => {
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

  it('should support client side navigation to ssg rsc pages', async () => {
    const browser = await webdriver(context.appPort, '/node')

    await browser.waitForElementByCss('#link-node-rsc-ssg').click()
    expect(await browser.elementByCss('body').text()).toContain(
      'This is a SSG RSC page.'
    )
  })

  it('should support client side navigation to static rsc pages', async () => {
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

describe('Switchable runtime (dev)', () => {
  const context = { appDir }

  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(context.appDir, context.appPort)
  })
  afterAll(async () => {
    await killApp(context.server)
  })

  flight(context)
  it('should support client side navigation to ssr rsc pages', async () => {
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

    expect(await browser.elementByCss('body').text()).toContain(
      'This is a SSR RSC page.'
    )
    expect(flightRequest).toContain('/node-rsc-ssr?__flight__=1')
  })

  it('should support client side navigation to ssg rsc pages', async () => {
    const browser = await webdriver(context.appPort, '/node')

    await browser
      .waitForElementByCss('#link-node-rsc-ssg')
      .click()
      .waitForElementByCss('.node-rsc-ssg')

    expect(await browser.elementByCss('body').text()).toContain(
      'This is a SSG RSC page.'
    )
  })

  it('should support client side navigation to static rsc pages', async () => {
    const browser = await webdriver(context.appPort, '/node')

    await browser
      .waitForElementByCss('#link-node-rsc')
      .click()
      .waitForElementByCss('.node-rsc')

    expect(await browser.elementByCss('body').text()).toContain(
      'This is a static RSC page.'
    )
  })

  it('should build /api/hello as an api route with edge runtime', async () => {
    const response = await fetchViaHTTP(context.appPort, '/api/hello')
    const text = await response.text()
    expect(text).toMatch(/Hello from .+\/api\/hello/)

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
      },
    })
  })
})
