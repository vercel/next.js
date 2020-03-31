/* eslint-env jest */
/* global jasmine */
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

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let app
let appPort
const appDir = join(__dirname, '../app')
const nextConfig = join(appDir, 'next.config.js')

const nextConfigContent = `
  experimental: {
    pageEnv: true,

    async redirects() {
      return [
        {
          source: '/hello',
          permanent: false,
          destination: \`/\${process.env.NEXT_APP_TEST_DEST}\`,
        }
      ]
    }
  }
`

const getEnvFromHtml = async path => {
  const html = await renderViaHTTP(appPort, path)
  return JSON.parse(
    cheerio
      .load(html)('p')
      .text()
  )
}

const runTests = (isDev, isServerless, isTestEnv) => {
  // TODO: support runtime overrides in serverless output
  if (!isServerless) {
    describe('Process environment', () => {
      it('should override .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.PROCESS_ENV_KEY).toEqual('processenvironment')
      })
    })
  }

  it('should provide global env to next.config.js', async () => {
    const res = await fetchViaHTTP(appPort, '/hello', undefined, {
      redirect: 'manual',
    })
    const { pathname } = url.parse(res.headers.get('location'))

    expect(res.status).toBe(307)
    expect(pathname).toBe('/another')
  })

  it('should inline global values during build', async () => {
    const html = await renderViaHTTP(appPort, '/global')
    const $ = cheerio.load(html)
    expect($('p').text()).toContain('another')
  })

  describe('Loads .env', () => {
    it('should provide env for SSG', async () => {
      const data = await getEnvFromHtml('/some-ssg')
      expect(data.ENV_FILE_KEY).toBe('env')
    })

    it('should provide env correctly for SSR', async () => {
      const data = await getEnvFromHtml('/some-ssp')
      expect(data.ENV_FILE_KEY).toBe('env')
    })

    it('should provide env correctly for API routes', async () => {
      const data = await renderViaHTTP(appPort, '/api/all')
      expect(JSON.parse(data).ENV_FILE_KEY).toEqual('env')
    })

    // TODO: uncomment once env is provided to next.config.js
    // it('should provide env correctly through next.config.js', async () => {
    //   const data = await getEnvFromHtml('/next-config-loaded-env')
    //   expect(data.ENV_FILE_KEY).toEqual('env')
    // })
  })

  if (!isTestEnv) {
    describe('Loads .env.local', () => {
      it('should provide env for SSG', async () => {
        const data = await getEnvFromHtml('/some-ssg')
        expect(data.LOCAL_ENV_FILE_KEY).toBe('localenv')
      })

      it('should provide env correctly for SSR', async () => {
        const data = await getEnvFromHtml('/some-ssp')
        expect(data.LOCAL_ENV_FILE_KEY).toBe('localenv')
      })

      it('should provide env correctly for API routes', async () => {
        const data = await renderViaHTTP(appPort, '/api/all')
        expect(JSON.parse(data).LOCAL_ENV_FILE_KEY).toEqual('localenv')
      })

      // TODO: uncomment once env is provided to next.config.js
      // it('should provide env correctly through next.config.js', async () => {
      //   const data = await getEnvFromHtml('/next-config-loaded-env')
      //   expect(data.LOCAL_ENV_FILE_KEY).toEqual('localenv')
      // })

      it('should load env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_KEY).toEqual('env')
      })

      it('should override env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_LOCAL_OVERRIDE_TEST).toEqual('localenv')
      })
    })

    describe('Loads .env.development', () => {
      it('should provide env for SSG', async () => {
        const data = await getEnvFromHtml('/some-ssg')
        expect(data.DEVELOPMENT_ENV_FILE_KEY).toBe(
          isDev ? 'development' : undefined
        )
      })

      it('should provide env correctly for SSR', async () => {
        const data = await getEnvFromHtml('/some-ssp')
        expect(data.DEVELOPMENT_ENV_FILE_KEY).toBe(
          isDev ? 'development' : undefined
        )
      })

      it('should provide env correctly for API routes', async () => {
        const data = await renderViaHTTP(appPort, '/api/all')
        expect(JSON.parse(data).DEVELOPMENT_ENV_FILE_KEY).toEqual(
          isDev ? 'development' : undefined
        )
      })

      // TODO: uncomment once env is provided to next.config.js
      // it('should provide env correctly through next.config.js', async () => {
      //   const data = await getEnvFromHtml('/next-config-loaded-env')
      //   expect(data.DEVELOPMENT_ENV_FILE_KEY).toEqual(
      //     isDev ? 'development' : undefined
      //   )
      // })

      it('should load env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_KEY).toEqual('env')
      })

      it('should override env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_DEVELOPMENT_OVERRIDE_TEST).toEqual(
          isDev ? 'development' : 'env'
        )
      })
    })

    describe('Loads .env.development.local', () => {
      it('should provide env for SSG', async () => {
        const data = await getEnvFromHtml('/some-ssg')
        expect(data.LOCAL_DEVELOPMENT_ENV_FILE_KEY).toBe(
          isDev ? 'localdevelopment' : undefined
        )
      })

      it('should provide env correctly for SSR', async () => {
        const data = await getEnvFromHtml('/some-ssp')
        expect(data.LOCAL_DEVELOPMENT_ENV_FILE_KEY).toBe(
          isDev ? 'localdevelopment' : undefined
        )
      })

      it('should provide env correctly for API routes', async () => {
        const data = await renderViaHTTP(appPort, '/api/all')
        expect(JSON.parse(data).LOCAL_DEVELOPMENT_ENV_FILE_KEY).toEqual(
          isDev ? 'localdevelopment' : undefined
        )
      })

      // TODO: uncomment once env is provided to next.config.js
      // it('should provide env correctly through next.config.js', async () => {
      //   const data = await getEnvFromHtml('/next-config-loaded-env')
      //   expect(data.LOCAL_DEVELOPMENT_ENV_FILE_KEY).toEqual(
      //     isDev ? 'localdevelopment' : undefined
      //   )
      // })

      it('should load env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_KEY).toEqual('env')
      })

      it('should override env from .env and .env.development', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_DEVELOPMENT_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
          isDev ? 'localdevelopment' : 'env'
        )
      })
    })

    describe('Loads .env.production', () => {
      it('should provide env for SSG', async () => {
        const data = await getEnvFromHtml('/some-ssg')
        expect(data.PRODUCTION_ENV_FILE_KEY).toBe(
          isDev ? undefined : 'production'
        )
      })

      it('should provide env correctly for SSR', async () => {
        const data = await getEnvFromHtml('/some-ssp')
        expect(data.PRODUCTION_ENV_FILE_KEY).toBe(
          isDev ? undefined : 'production'
        )
      })

      it('should provide env correctly for API routes', async () => {
        const data = await renderViaHTTP(appPort, '/api/all')
        expect(JSON.parse(data).PRODUCTION_ENV_FILE_KEY).toEqual(
          isDev ? undefined : 'production'
        )
      })

      // TODO: uncomment once env is provided to next.config.js
      // it('should provide env correctly through next.config.js', async () => {
      //   const data = await getEnvFromHtml('/next-config-loaded-env')
      //   expect(data.PRODUCTION_ENV_FILE_KEY).toEqual(
      //     isDev ? undefined : 'production'
      //   )
      // })

      it('should load env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_KEY).toEqual('env')
      })

      it('should override env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_PRODUCTION_OVERRIDEOVERRIDE_TEST).toEqual(
          isDev ? 'env' : 'production'
        )
      })
    })

    describe('Loads .env.production.local', () => {
      it('should provide env for SSG', async () => {
        const data = await getEnvFromHtml('/some-ssg')
        expect(data.LOCAL_PRODUCTION_ENV_FILE_KEY).toBe(
          isDev ? undefined : 'localproduction'
        )
      })

      it('should provide env correctly for SSR', async () => {
        const data = await getEnvFromHtml('/some-ssp')
        expect(data.LOCAL_PRODUCTION_ENV_FILE_KEY).toBe(
          isDev ? undefined : 'localproduction'
        )
      })

      it('should provide env correctly for API routes', async () => {
        const data = await renderViaHTTP(appPort, '/api/all')
        expect(JSON.parse(data).LOCAL_PRODUCTION_ENV_FILE_KEY).toEqual(
          isDev ? undefined : 'localproduction'
        )
      })

      // TODO: uncomment once env is provided to next.config.js
      // it('should provide env correctly through next.config.js', async () => {
      //   const data = await getEnvFromHtml('/next-config-loaded-env')
      //   expect(data.LOCAL_PRODUCTION_ENV_FILE_KEY).toEqual(
      //     isDev ? undefined : 'localproduction'
      //   )
      // })

      it('should load env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_KEY).toEqual('env')
      })

      it('should override env from .env and .env.production', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_PRODUCTION_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
          isDev ? 'env' : 'localproduction'
        )
      })
    })
  }

  if (isTestEnv) {
    describe('Loads .env.test', () => {
      it('should provide env for SSG', async () => {
        const data = await getEnvFromHtml('/some-ssg')
        expect(data.TEST_ENV_FILE_KEY).toBe(isDev ? 'test' : undefined)
      })

      it('should provide env correctly for SSR', async () => {
        const data = await getEnvFromHtml('/some-ssp')
        expect(data.TEST_ENV_FILE_KEY).toBe(isDev ? 'test' : undefined)
      })

      it('should provide env correctly for API routes', async () => {
        const data = await renderViaHTTP(appPort, '/api/all')
        expect(JSON.parse(data).TEST_ENV_FILE_KEY).toEqual(
          isDev ? 'test' : undefined
        )
      })

      // TODO: uncomment once env is provided to next.config.js
      // it('should provide env correctly through next.config.js', async () => {
      //   const data = await getEnvFromHtml('/next-config-loaded-env')
      //   expect(data.TEST_ENV_FILE_KEY).toEqual(isDev ? 'test' : undefined)
      // })

      it('should load env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_KEY).toEqual('env')
      })

      it('should override env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_TEST_OVERRIDE_TEST).toEqual(isDev ? 'test' : 'env')
      })
    })

    describe('Loads .env.test.local', () => {
      it('should provide env for SSG', async () => {
        const data = await getEnvFromHtml('/some-ssg')
        expect(data.LOCAL_TEST_ENV_FILE_KEY).toBe(
          isDev ? 'localtest' : undefined
        )
      })

      it('should provide env correctly for SSR', async () => {
        const data = await getEnvFromHtml('/some-ssp')
        expect(data.LOCAL_TEST_ENV_FILE_KEY).toBe(
          isDev ? 'localtest' : undefined
        )
      })

      it('should provide env correctly for API routes', async () => {
        const data = await renderViaHTTP(appPort, '/api/all')
        expect(JSON.parse(data).LOCAL_TEST_ENV_FILE_KEY).toEqual(
          isDev ? 'localtest' : undefined
        )
      })

      // TODO: uncomment once env is provided to next.config.js
      // it('should provide env correctly through next.config.js', async () => {
      //   const data = await getEnvFromHtml('/next-config-loaded-env')
      //   expect(data.LOCAL_TEST_ENV_FILE_KEY).toEqual(
      //     isDev ? 'localtest' : undefined
      //   )
      // })

      it('should load env from .env', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_KEY).toEqual('env')
      })

      it('should override env from .env and .env.test', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.ENV_FILE_TEST_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
          isDev ? 'localtest' : 'env'
        )
      })

      it('should not load .env.local', async () => {
        const data = await getEnvFromHtml('/')
        expect(data.LOCAL_ENV_FILE_KEY).toEqual(undefined)
      })
    })
  }
}

describe('Env Config', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { env: { NC_ENV_FILE_KEY: process.env.ENV_FILE_KEY, NC_LOCAL_ENV_FILE_KEY: process.env.LOCAL_ENV_FILE_KEY, NC_PRODUCTION_ENV_FILE_KEY: process.env.PRODUCTION_ENV_FILE_KEY, NC_LOCAL_PRODUCTION_ENV_FILE_KEY: process.env.LOCAL_PRODUCTION_ENV_FILE_KEY, NC_DEVELOPMENT_ENV_FILE_KEY: process.env.DEVELOPMENT_ENV_FILE_KEY, NC_LOCAL_DEVELOPMENT_ENV_FILE_KEY: process.env.LOCAL_DEVELOPMENT_ENV_FILE_KEY }, ${nextConfigContent} }`
      )
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: {
          PROCESS_ENV_KEY: 'processenvironment',
        },
      })
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
      await killApp(app)
    })

    runTests(true, false, false)
  })

  describe('test environment', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { env: { NC_ENV_FILE_KEY: process.env.ENV_FILE_KEY, NC_LOCAL_ENV_FILE_KEY: process.env.LOCAL_ENV_FILE_KEY, NC_PRODUCTION_ENV_FILE_KEY: process.env.PRODUCTION_ENV_FILE_KEY, NC_LOCAL_PRODUCTION_ENV_FILE_KEY: process.env.LOCAL_PRODUCTION_ENV_FILE_KEY, NC_DEVELOPMENT_ENV_FILE_KEY: process.env.DEVELOPMENT_ENV_FILE_KEY, NC_LOCAL_DEVELOPMENT_ENV_FILE_KEY: process.env.LOCAL_DEVELOPMENT_ENV_FILE_KEY, NC_TEST_ENV_FILE_KEY: process.env.TEST_ENV_FILE_KEY, NC_LOCAL_TEST_ENV_FILE_KEY: process.env.LOCAL_TEST_ENV_FILE_KEY }, ${nextConfigContent} }`
      )
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: {
          PROCESS_ENV_KEY: 'processenvironment',
          NODE_ENV: 'test',
        },
      })
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
      await killApp(app)
    })

    runTests(true, false, true)
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { env: { NC_ENV_FILE_KEY: process.env.ENV_FILE_KEY, NC_LOCAL_ENV_FILE_KEY: process.env.LOCAL_ENV_FILE_KEY, NC_PRODUCTION_ENV_FILE_KEY: process.env.PRODUCTION_ENV_FILE_KEY, NC_LOCAL_PRODUCTION_ENV_FILE_KEY: process.env.LOCAL_PRODUCTION_ENV_FILE_KEY, NC_DEVELOPMENT_ENV_FILE_KEY: process.env.DEVELOPMENT_ENV_FILE_KEY, NC_LOCAL_DEVELOPMENT_ENV_FILE_KEY: process.env.LOCAL_DEVELOPMENT_ENV_FILE_KEY }, ${nextConfigContent} }`
      )
      const { code } = await nextBuild(appDir, [], {
        env: {
          PROCESS_ENV_KEY: 'processenvironment',
        },
      })
      if (code !== 0) throw new Error(`Build failed with exit code ${code}`)
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {})
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
      await killApp(app)
    })

    runTests(false, false, false)
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'experimental-serverless-trace', env: { NC_ENV_FILE_KEY: process.env.ENV_FILE_KEY, NC_LOCAL_ENV_FILE_KEY: process.env.LOCAL_ENV_FILE_KEY, NC_PRODUCTION_ENV_FILE_KEY: process.env.PRODUCTION_ENV_FILE_KEY, NC_LOCAL_PRODUCTION_ENV_FILE_KEY: process.env.LOCAL_PRODUCTION_ENV_FILE_KEY, NC_DEVELOPMENT_ENV_FILE_KEY: process.env.DEVELOPMENT_ENV_FILE_KEY, NC_LOCAL_DEVELOPMENT_ENV_FILE_KEY: process.env.LOCAL_DEVELOPMENT_ENV_FILE_KEY }, ${nextConfigContent} }`
      )
      const { code } = await nextBuild(appDir, [], {})
      if (code !== 0) throw new Error(`Build failed with exit code ${code}`)
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        env: {
          PROCESS_ENV_KEY: 'processenvironment',
        },
      })
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
      await killApp(app)
    })

    runTests(false, true, false)
  })
})
