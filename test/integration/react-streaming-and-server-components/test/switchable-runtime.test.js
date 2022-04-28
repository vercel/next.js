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

const appDir = join(__dirname, '../switchable-runtime')

function splitLines(text) {
  return text
    .split(/\r?\n/g)
    .map((str) => str.trim())
    .filter(Boolean)
}

async function testRoute(appPort, url, { isStatic, isEdge, isRSC }) {
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
  const customAppServerHtml = '<div class="app-server-root"'
  if (isRSC) {
    expect(html1).toContain(customAppServerHtml)
  } else {
    expect(html1).not.toContain(customAppServerHtml)
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

  it('should build /static as a static page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/static', {
      isStatic: true,
      isEdge: false,
      isRSC: false,
    })
  })

  it('should build /node as a static page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node', {
      isStatic: true,
      isEdge: false,
      isRSC: false,
    })
  })

  it('should build /node-ssr as a dynamic page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node-ssr', {
      isStatic: false,
      isEdge: false,
      isRSC: false,
    })
  })

  it('should build /node-ssg as a static page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node-ssg', {
      isStatic: true,
      isEdge: false,
      isRSC: false,
    })
  })

  it('should build /node-rsc as a static page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node-rsc', {
      isStatic: true,
      isEdge: false,
      isRSC: true,
    })

    const html = await renderViaHTTP(context.appPort, '/node-rsc')
    expect(html).toContain('data-title="node-rsc"')
  })

  it('should build /node-rsc-ssr as a dynamic page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node-rsc-ssr', {
      isStatic: false,
      isEdge: false,
      isRSC: true,
    })
  })

  it('should build /node-rsc-ssg as a static page with the nodejs runtime', async () => {
    await testRoute(context.appPort, '/node-rsc-ssg', {
      isStatic: true,
      isEdge: false,
      isRSC: true,
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
      isRSC: false,
    })
  })

  it('should build /edge-rsc as a dynamic page with the edge runtime', async () => {
    await testRoute(context.appPort, '/edge-rsc', {
      isStatic: false,
      isEdge: true,
      isRSC: true,
    })
  })

  it('should display correct tree view with page types in terminal', async () => {
    const stdoutLines = splitLines(context.stdout).filter((line) =>
      /^[┌├└/]/.test(line)
    )
    const expectedOutputLines = splitLines(`
  ┌   /_app
  ├   /_app.server
  ├ ○ /404
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
    const isMatched = expectedOutputLines.every((line, index) => {
      const matched = stdoutLines[index].startsWith(line)
      return matched
    })

    expect(isMatched).toBe(true)
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
})
