/* eslint-env jest */

import { join } from 'path'
import { findPort, killApp, renderViaHTTP } from 'next-test-utils'
import { nextBuild, nextStart } from './utils'

const appDir = join(__dirname, '../switchable-runtime')

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
    // Should not be re-rendered, some timestamp should be returned.
    expect(renderedAt1).toBe(renderedAt2)
  } else {
    // Should be re-rendered.
    expect(renderedAt1).toBeLessThan(renderedAt2)
  }
}

describe('Without global runtime configuration', () => {
  const context = { appDir }

  beforeAll(async () => {
    context.appPort = await findPort()
    const { stdout, stderr } = await nextBuild(context.appDir)
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

  it('should display correct tree view with page types in terminal', async () => {
    const stdoutLines = splitLines(context.stdout).filter((line) =>
      /^[┌├└/]/.test(line)
    )
    const expectedOutputLines = splitLines(`
  ┌ λ /404
  ├ ℇ /edge
  ├ ℇ /edge-rsc
  ├ ○ /node
  ├ ● /node-rsc
  ├ ● /node-rsc-ssg
  ├ λ /node-rsc-ssr
  ├ ● /node-ssg
  ├ λ /node-ssr
  └ ○ /static
  `)
    const isMatched = expectedOutputLines.every((line, index) =>
      stdoutLines[index].startsWith(line)
    )
    expect(isMatched).toBe(true)
  })
})
