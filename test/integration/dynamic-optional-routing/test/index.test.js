/* eslint-env jest */

import cheerio from 'cheerio'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
const appDir = join(__dirname, '../')

const DUMMY_PAGE = 'export default () => null'

function runTests() {
  it('should render catch-all top-level route with multiple segments', async () => {
    const html = await renderViaHTTP(appPort, '/hello/world')
    const $ = cheerio.load(html)
    expect($('#optional-route').text()).toBe(
      'top level route param: [hello,world]'
    )
  })

  it('should render catch-all top-level route with single segment', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    const $ = cheerio.load(html)
    expect($('#optional-route').text()).toBe('top level route param: [hello]')
  })

  it('should render catch-all top-level route with no segments', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect($('#optional-route').text()).toBe('top level route param: undefined')
  })

  it('should render catch-all nested route with multiple segments', async () => {
    const html = await renderViaHTTP(appPort, '/nested/hello/world')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe(
      'nested route param: [hello,world]'
    )
  })

  it('should render catch-all nested route with single segment', async () => {
    const html = await renderViaHTTP(appPort, '/nested/hello')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe(
      'nested route param: [hello]'
    )
  })

  it('should render catch-all nested route with no segments', async () => {
    const html = await renderViaHTTP(appPort, '/nested')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe(
      'nested route param: undefined'
    )
  })

  it('should render catch-all nested route with no segments and leading slash', async () => {
    const html = await renderViaHTTP(appPort, '/nested/')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe(
      'nested route param: undefined'
    )
  })

  it('should match catch-all api route with multiple segments', async () => {
    const res = await fetchViaHTTP(appPort, '/api/post/ab/cd')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: ['ab', 'cd'] })
  })

  it('should match catch-all api route with single segment', async () => {
    const res = await fetchViaHTTP(appPort, '/api/post/a')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: ['a'] })
  })

  it('should match catch-all api route with no segments', async () => {
    const res = await fetchViaHTTP(appPort, '/api/post')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('should match catch-all api route with no segments and leading slash', async () => {
    const res = await fetchViaHTTP(appPort, '/api/post/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })
}

const nextConfig = join(appDir, 'next.config.js')

function runInvalidPagesTests(buildFn) {
  it('should fail to build when optional route has index.js at root', async () => {
    const invalidRoute = appDir + 'pages/index.js'
    try {
      await fs.outputFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      const { stderr } = await buildFn(appDir)
      await expect(stderr).toMatch(
        'You cannot define a route with the same specificity as a optional catch-all route'
      )
    } finally {
      await fs.unlink(invalidRoute)
    }
  })

  it('should fail to build when optional route has same page at root', async () => {
    const invalidRoute = appDir + 'pages/nested.js'
    try {
      await fs.outputFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      const { stderr } = await buildFn(appDir)
      await expect(stderr).toMatch(
        'You cannot define a route with the same specificity as a optional catch-all route'
      )
    } finally {
      await fs.unlink(invalidRoute)
    }
  })

  it('should fail to build when mixed with regular catch-all', async () => {
    const invalidRoute = appDir + 'pages/nested/[...param].js'
    try {
      await fs.outputFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      const { stderr } = await buildFn(appDir)
      await expect(stderr).toMatch(/You cannot use both .+ at the same level/)
    } finally {
      await fs.unlink(invalidRoute)
    }
  })

  it('should fail to build when optional but no catch-all', async () => {
    const invalidRoute = appDir + 'pages/invalid/[[param]].js'
    try {
      await fs.outputFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      const { stderr } = await buildFn(appDir)
      await expect(stderr).toMatch(
        'Optional route parameters are not yet supported'
      )
    } finally {
      await fs.unlink(invalidRoute)
    }
  })
}

describe('Dynamic Optional Routing', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
    runInvalidPagesTests(async appDir => {
      let stderr = ''
      await launchApp(appDir, await findPort(), {
        onStderr: msg => {
          stderr += msg
        },
      })
      await waitFor(1000)
      return { stderr }
    })
  })

  describe('production mode', () => {
    beforeAll(async () => {
      const curConfig = await fs.readFile(nextConfig, 'utf8')

      if (curConfig.includes('target')) {
        await fs.writeFile(
          nextConfig,
          `module.exports = { experimental: { optionalCatchAll: true } }`
        )
      }
      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
    runInvalidPagesTests(async appDir =>
      nextBuild(appDir, [], { stderr: true })
    )
  })

  describe('serverless mode', () => {
    let origNextConfig

    beforeAll(async () => {
      origNextConfig = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless', experimental: { optionalCatchAll: true } }`
      )

      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origNextConfig)
      await killApp(app)
    })
    runTests()
  })
})
