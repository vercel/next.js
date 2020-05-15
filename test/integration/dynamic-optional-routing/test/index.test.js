/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import fs from 'fs-extra'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import cheerio from 'cheerio'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let app
let appPort
const appDir = join(__dirname, '../')

const DUMMY_PAGE = 'export default () => null'

function runTests() {
  it('should render catch-all top-level route with multiple segments', async () => {
    const html = await renderViaHTTP(appPort, '/hello/world')
    const $ = cheerio.load(html)
    expect($('#optional-route').text()).toBe('hello/world')
  })

  it('should render catch-all top-level route with single segment', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    const $ = cheerio.load(html)
    expect($('#optional-route').text()).toBe('hello')
  })

  it('should render catch-all top-level route with no segments', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect($('#optional-route').text()).toBe('')
  })

  it('should render catch-all nested route with multiple segments', async () => {
    const html = await renderViaHTTP(appPort, '/nested/hello/world')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe('hello/world')
  })

  it('should render catch-all nested route with single segment', async () => {
    const html = await renderViaHTTP(appPort, '/nested/hello')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe('hello')
  })

  it('should render catch-all nested route with no segments', async () => {
    const html = await renderViaHTTP(appPort, '/nested/')
    const $ = cheerio.load(html)
    expect($('#nested-optional-route').text()).toBe('')
  })
}

const nextConfig = join(appDir, 'next.config.js')

function runInvalidPagesTests(buildFn) {
  it('should fail to build when optional route has index.js at root', async () => {
    const invalidRoute = appDir + 'pages/index.js'
    try {
      await fs.writeFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      const { stderr } = await buildFn(appDir)
      await expect(stderr).toMatch(
        `An optional route at "/" can't coexist with an index route at its root`
      )
    } finally {
      await fs.unlink(invalidRoute)
    }
  })

  it('should fail to build when optional route has same page at root', async () => {
    const invalidRoute = appDir + 'pages/nested.js'
    try {
      await fs.writeFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      const { stderr } = await buildFn(appDir)
      await expect(stderr).toMatch(
        `An optional route at "/nested/" can't coexist with an index route at its root`
      )
    } finally {
      await fs.unlink(invalidRoute)
    }
  })

  it('should fail to build when mixed with regular catch-all', async () => {
    const invalidRoute = appDir + 'pages/nested/[...param].js'
    try {
      await fs.writeFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      const { stderr } = await buildFn(appDir)
      await expect(stderr).toMatch(
        'You cannot use different slug names for the same dynamic path'
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
        ignoreBootupMarkers: true,
        onStderr: msg => {
          stderr += msg
        },
      })
      return { stderr }
    })
  })

  describe('production mode', () => {
    beforeAll(async () => {
      const curConfig = await fs.readFile(nextConfig, 'utf8')

      if (curConfig.includes('target')) {
        await fs.writeFile(
          nextConfig,
          `
          module.exports = {
            experimental: {
              modern: true
            }
          }
        `
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
        `
        module.exports = {
          target: 'serverless',
          experimental: {
            modern: true
          }
        }
      `
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
