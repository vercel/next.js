/* eslint-env jest */

import url from 'url'
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
  fetchViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
const appDir = join(__dirname, '../app')

const getEnvFromHtml = async (path) => {
  const html = await renderViaHTTP(appPort, path)
  const $ = cheerio.load(html)
  const env = JSON.parse($('p').text())
  env.nextConfigEnv = $('#nextConfigEnv').text()
  env.nextConfigPublicEnv = $('#nextConfigPublicEnv').text()
  return env
}

const runTests = (mode = 'dev') => {
  const isDevOnly = mode === 'dev'
  const isTestEnv = mode === 'test'
  const isDev = isDevOnly || isTestEnv

  const checkEnvData = (data) => {
    expect(data.ENV_FILE_KEY).toBe('env')
    expect(data.LOCAL_ENV_FILE_KEY).toBe(!isTestEnv ? 'localenv' : undefined)
    expect(data.DEVELOPMENT_ENV_FILE_KEY).toBe(
      isDevOnly ? 'development' : undefined
    )
    expect(data.LOCAL_DEVELOPMENT_ENV_FILE_KEY).toBe(
      isDevOnly ? 'localdevelopment' : undefined
    )
    expect(data.TEST_ENV_FILE_KEY).toBe(isTestEnv ? 'test' : undefined)
    expect(data.LOCAL_TEST_ENV_FILE_KEY).toBe(
      isTestEnv ? 'localtest' : undefined
    )
    expect(data.PRODUCTION_ENV_FILE_KEY).toBe(isDev ? undefined : 'production')
    expect(data.LOCAL_PRODUCTION_ENV_FILE_KEY).toBe(
      isDev ? undefined : 'localproduction'
    )
    expect(data.ENV_FILE_EXPANDED).toBe('env')
    expect(data.ENV_FILE_EXPANDED_CONCAT).toBe('hello-env')
    expect(data.ENV_FILE_EXPANDED_ESCAPED).toBe('$ENV_FILE_KEY')
    expect(data.ENV_FILE_KEY_EXCLAMATION).toBe('hello!')
    expect(data.ENV_FILE_EMPTY_FIRST).toBe(isTestEnv ? '' : '$escaped')
    expect(data.ENV_FILE_PROCESS_ENV).toBe('env-cli')

    expect(data.nextConfigEnv).toBe('hello from next.config.js')
    expect(data.nextConfigPublicEnv).toBe('hello again from next.config.js')
  }

  it('should have process environment override .env', async () => {
    const data = await getEnvFromHtml('/')
    expect(data.PROCESS_ENV_KEY).toEqual('processenvironment')
  })

  it('should provide global env to next.config.js', async () => {
    const res = await fetchViaHTTP(appPort, '/hello', undefined, {
      redirect: 'manual',
    })
    const { pathname } = url.parse(res.headers.get('location'))

    expect(res.status).toBe(307)
    expect(pathname).toBe('/another')
  })

  it('should inline global values during build', async () => {
    // make sure to build page
    await renderViaHTTP(appPort, '/global')

    const buildManifest = require(join(
      __dirname,
      '../app/.next/build-manifest.json'
    ))

    const pageFile = buildManifest.pages['/global'].find((filename) =>
      filename.includes('pages/global')
    )

    // read client bundle contents since a server side render can
    // have the value available during render but it not be injected
    const bundleContent = await fs.readFile(
      join(appDir, '.next', pageFile),
      'utf8'
    )
    expect(bundleContent).toContain('another')
  })

  it('should provide env for SSG', async () => {
    const data = await getEnvFromHtml('/some-ssg')
    checkEnvData(data)
  })

  it('should provide env correctly for SSR', async () => {
    const data = await getEnvFromHtml('/some-ssp')
    checkEnvData(data)
  })

  it('should provide env correctly for API routes', async () => {
    const data = JSON.parse(await renderViaHTTP(appPort, '/api/all'))
    checkEnvData(data)
  })

  it('should load env from .env', async () => {
    const data = await getEnvFromHtml('/')
    expect(data.ENV_FILE_KEY).toEqual('env')
    expect(data.ENV_FILE_DEVELOPMENT_OVERRIDE_TEST).toEqual(
      isDevOnly ? 'development' : 'env'
    )
    expect(data.ENV_FILE_DEVELOPMENT_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
      isDevOnly ? 'localdevelopment' : 'env'
    )
    expect(data.ENV_FILE_TEST_OVERRIDE_TEST).toEqual(isTestEnv ? 'test' : 'env')
    expect(data.ENV_FILE_TEST_LOCAL_OVERRIDEOVERRIDE_TEST).toBe(
      isTestEnv ? 'localtest' : 'env'
    )
    expect(data.LOCAL_ENV_FILE_KEY).toBe(isTestEnv ? undefined : 'localenv')
    expect(data.ENV_FILE_PRODUCTION_OVERRIDEOVERRIDE_TEST).toEqual(
      isDev ? 'env' : 'production'
    )
    expect(data.ENV_FILE_PRODUCTION_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
      isDev ? 'env' : 'localproduction'
    )
  })
}

describe('Env Config', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: {
          PROCESS_ENV_KEY: 'processenvironment',
          ENV_FILE_PROCESS_ENV: 'env-cli',
        },
      })
    })
    afterAll(() => killApp(app))

    runTests('dev')
  })

  describe('test environment', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: {
          PROCESS_ENV_KEY: 'processenvironment',
          NODE_ENV: 'test',
          ENV_FILE_PROCESS_ENV: 'env-cli',
        },
      })
    })
    afterAll(() => killApp(app))

    runTests('test')
  })

  describe('server mode', () => {
    beforeAll(async () => {
      const { code } = await nextBuild(appDir, [], {
        env: {
          PROCESS_ENV_KEY: 'processenvironment',
          ENV_FILE_PROCESS_ENV: 'env-cli',
        },
      })
      if (code !== 0) throw new Error(`Build failed with exit code ${code}`)

      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        env: {
          ENV_FILE_PROCESS_ENV: 'env-cli',
        },
      })
    })
    afterAll(() => killApp(app))

    runTests('server')
  })

  describe('serverless mode', () => {
    let nextConfigContent = ''
    const nextConfigPath = join(appDir, 'next.config.js')
    const envFiles = [
      '.env',
      '.env.development',
      '.env.development.local',
      '.env.local',
      '.env.production',
      '.env.production.local',
      '.env.test',
      '.env.test.local',
    ].map((file) => join(appDir, file))

    beforeAll(async () => {
      nextConfigContent = await fs.readFile(nextConfigPath, 'utf8')
      await fs.writeFile(
        nextConfigPath,
        nextConfigContent.replace(
          '// update me',
          `target: 'experimental-serverless-trace',`
        )
      )
      const { code } = await nextBuild(appDir, [], {
        env: {
          PROCESS_ENV_KEY: 'processenvironment',
          ENV_FILE_PROCESS_ENV: 'env-cli',
        },
      })

      if (code !== 0) throw new Error(`Build failed with exit code ${code}`)
      appPort = await findPort()

      // rename the files so they aren't loaded by `next start`
      // to test that they were bundled into the serverless files
      for (const file of envFiles) {
        await fs.rename(file, `${file}.bak`)
      }

      app = await nextStart(appDir, appPort, {
        env: {
          ENV_FILE_PROCESS_ENV: 'env-cli',
        },
      })
    })
    afterAll(async () => {
      for (const file of envFiles) {
        await fs.rename(`${file}.bak`, file)
      }
      await fs.writeFile(nextConfigPath, nextConfigContent)
      await killApp(app)
    })

    runTests('serverless')
  })
})
