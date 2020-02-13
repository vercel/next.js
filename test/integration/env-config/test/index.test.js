/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import {
  nextBuild,
  nextStart,
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let app
let appPort
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

const neededDevEnv = { NOTION_KEY: 'hello-notion' }
const expectedDevEnv = {
  NOTION_KEY: 'hello-notion',
  DATABASE_SECRET: 'abc',
  APP_TITLE: 'hello',
}

const neededProdEnv = {
  SENTRY_DSN: 'bug-catcher',
  NOTION_KEY: 'hello-notion',
}
const expectedProdEnv = {
  APP_TITLE: 'hello',
  SENTRY_DSN: 'bug-catcher',
  NOTION_KEY: 'hello-notion',
  DATABASE_SECRET: 'cba',
}

const getEnvFromHtml = async path => {
  const html = await renderViaHTTP(appPort, path)
  return JSON.parse(
    cheerio
      .load(html)('p')
      .text()
  )
}

const runTests = (isDev = false) => {
  const expectedEnv = isDev ? expectedDevEnv : expectedProdEnv

  it('should provide env correctly for getStaticProps', async () => {
    expect(await getEnvFromHtml('/')).toEqual(expectedEnv)
  })

  it('should provide specific env correctly for SSG routes', async () => {
    const data = await getEnvFromHtml('/some-ssg')
    expect(data).toEqual({
      NOTION_KEY: expectedEnv.NOTION_KEY,
      DATABASE_SECRET: expectedEnv.DATABASE_SECRET,
    })
  })

  it('should provide specific env correctly for SSG routes', async () => {
    const data = await getEnvFromHtml('/some-ssp')
    expect(data).toEqual({
      NOTION_KEY: expectedEnv.NOTION_KEY,
      DATABASE_SECRET: expectedEnv.DATABASE_SECRET,
    })
  })

  it('should provide env correctly for getServerProps', async () => {
    expect(await getEnvFromHtml('/ssp')).toEqual(expectedEnv)
  })

  it('should provide env correctly for API routes', async () => {
    const data = await renderViaHTTP(appPort, '/api/all')
    expect(JSON.parse(data)).toEqual(expectedEnv)
  })

  it('should provide env correctly for API routes specific item', async () => {
    const data = await renderViaHTTP(appPort, '/api/notion')
    expect(JSON.parse(data)).toEqual({ NOTION_KEY: expectedProdEnv.NOTION_KEY })
  })

  it('should provide env correctly for API routes specific items', async () => {
    const data = await renderViaHTTP(appPort, '/api/some')
    expect(JSON.parse(data)).toEqual({
      NOTION_KEY: expectedEnv.NOTION_KEY,
      SENTRY_DSN: expectedEnv.SENTRY_DSN,
    })
  })
}

describe('Env Config', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, { env: neededDevEnv })
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('server mode', () => {
    beforeAll(async () => {
      const { code } = await nextBuild(appDir, [], { env: neededProdEnv })
      if (code !== 0) throw new Error(`Build failed with exit code ${code}`)
      appPort = await findPort()
      app = await nextStart(appDir, appPort, { env: neededProdEnv })
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'experimental-serverless-trace' }`
      )
      const { code } = await nextBuild(appDir, [], { env: neededProdEnv })
      if (code !== 0) throw new Error(`Build failed with exit code ${code}`)
      appPort = await findPort()
      app = await nextStart(appDir, appPort, { env: neededProdEnv })
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
      await killApp(app)
    })

    runTests()
  })
})
