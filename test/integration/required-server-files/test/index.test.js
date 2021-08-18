/* eslint-env jest */

import os from 'os'
import glob from 'glob'
import fs from 'fs-extra'
import execa from 'execa'
import cheerio from 'cheerio'
import { join, dirname, relative } from 'path'
import { version } from 'next/package'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../app')
const workDir = join(os.tmpdir(), `required-server-files-${Date.now()}`)
let server
let nextApp
let appPort
let buildId
let requiredFilesManifest
let errors = []

describe('Required Server Files', () => {
  beforeAll(async () => {
    const nextServerTrace = await fs.readJSON(
      require.resolve('next/dist/server/next-server') + '.nft.json'
    )
    const packageDir = dirname(require.resolve('next/package.json'))
    await execa('yarn', ['pack'], {
      cwd: packageDir,
    })
    const packagePath = join(packageDir, `next-v${version}.tgz`)

    await fs.ensureDir(workDir)
    await fs.writeFile(
      join(workDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          next: packagePath,
          react: 'latest',
          'react-dom': 'latest',
        },
      })
    )
    await fs.copy(appDir, workDir)

    await execa('yarn', ['install'], {
      cwd: workDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        YARN_CACHE_FOLDER: join(workDir, '.yarn-cache'),
      },
    })

    await execa('yarn', ['next', 'build'], {
      cwd: workDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NOW_BUILDER: '1',
      },
    })

    buildId = await fs.readFile(join(workDir, '.next/BUILD_ID'), 'utf8')
    requiredFilesManifest = await fs.readJSON(
      join(workDir, '.next/required-server-files.json')
    )

    // react and react-dom need to be traced specific to version
    // so isn't pre-traced
    await fs.ensureDir(`${workDir}-react`)
    await fs.writeFile(
      join(`${workDir}-react/package.json`),
      JSON.stringify({
        dependencies: {
          react: 'latest',
          'react-dom': 'latest',
        },
      })
    )
    await execa('yarn', ['install'], {
      cwd: `${workDir}-react`,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        YARN_CACHE_FOLDER: join(workDir, '.yarn'),
      },
    })
    await fs.remove(packagePath)

    const files = await recursiveReadDir(workDir, /.*/)

    const pageTraceFiles = await glob.sync('**/*.nft.json', {
      cwd: join(workDir, '.next/server/pages'),
    })
    const combinedTraces = new Set()

    for (const file of pageTraceFiles) {
      const filePath = join(workDir, '.next/server/pages', file)
      const trace = await fs.readJSON(filePath)

      trace.files.forEach((f) =>
        combinedTraces.add(relative(workDir, join(dirname(filePath), f)))
      )
    }

    for (const file of files) {
      const cleanFile = join('./', file)
      if (
        !nextServerTrace.files.includes(cleanFile) &&
        file !== '/node_modules/next/dist/server/next-server.js' &&
        !combinedTraces.has(cleanFile) &&
        !requiredFilesManifest.files.includes(cleanFile) &&
        !cleanFile.startsWith('.next/server') &&
        cleanFile !== '.next/required-server-files.json'
      ) {
        await fs.remove(join(workDir, file))
      }
    }

    for (const file of await fs.readdir(`${workDir}-react/node_modules`)) {
      await fs.copy(
        join(`${workDir}-react/node_modules`, file),
        join(workDir, 'node_modules', file)
      )
    }
    await fs.remove(`${workDir}-react`)

    async function startServer() {
      const http = require('http')
      const NextServer = require('next/dist/server/next-server').default

      const appPort = process.env.PORT
      nextApp = new NextServer({
        conf: global.nextConfig,
        dir: process.env.APP_DIR,
        quiet: false,
        minimalMode: true,
      })

      server = http.createServer(async (req, res) => {
        try {
          await nextApp.getRequestHandler()(req, res)
        } catch (err) {
          console.error('top-level', err)
          res.statusCode = 500
          res.end('error')
        }
      })
      await new Promise((res, rej) => {
        server.listen(appPort, (err) => (err ? rej(err) : res()))
      })
      console.log(`Listening at ::${appPort}`)
    }

    const serverPath = join(workDir, 'server.js')

    await fs.writeFile(
      serverPath,
      'global.nextConfig = ' +
        JSON.stringify(requiredFilesManifest.config) +
        ';\n' +
        startServer.toString() +
        ';\n' +
        `startServer().catch(console.error)`
    )

    appPort = await findPort()
    server = await initNextServerScript(
      serverPath,
      /Listening at/,
      {
        ...process.env,
        NODE_ENV: 'production',
        PORT: appPort,
        APP_DIR: workDir,
      },
      undefined,
      {
        cwd: workDir,
        onStderr(msg) {
          if (msg.includes('top-level')) {
            errors.push(msg)
          }
        },
      }
    )
  })
  afterAll(async () => {
    if (server) killApp(server)
    await fs.remove(workDir)
  })

  it('should output required-server-files manifest correctly', async () => {
    expect(requiredFilesManifest.version).toBe(1)
    expect(Array.isArray(requiredFilesManifest.files)).toBe(true)
    expect(Array.isArray(requiredFilesManifest.ignore)).toBe(true)
    expect(requiredFilesManifest.files.length).toBeGreaterThan(0)
    expect(requiredFilesManifest.ignore.length).toBeGreaterThan(0)
    expect(typeof requiredFilesManifest.config.configFile).toBe('undefined')
    expect(typeof requiredFilesManifest.config.trailingSlash).toBe('boolean')
    expect(typeof requiredFilesManifest.appDir).toBe('string')

    for (const file of requiredFilesManifest.files) {
      expect(await fs.exists(join(workDir, file))).toBe(true)
    }
    expect(await fs.exists(join(workDir, '.next/server'))).toBe(true)
  })

  it('should render SSR page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    const data = JSON.parse($('#props').text())

    expect($('#index').text()).toBe('index page')
    expect(data.hello).toBe('world')

    const html2 = await renderViaHTTP(appPort, '/')
    const $2 = cheerio.load(html2)
    const data2 = JSON.parse($2('#props').text())

    expect($2('#index').text()).toBe('index page')
    expect(isNaN(data2.random)).toBe(false)
    expect(data2.random).not.toBe(data.random)
  })

  it('should render dynamic SSR page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/dynamic/first')
    const $ = cheerio.load(html)
    const data = JSON.parse($('#props').text())

    expect($('#dynamic').text()).toBe('dynamic page')
    expect($('#slug').text()).toBe('first')
    expect(data.hello).toBe('world')

    const html2 = await renderViaHTTP(appPort, '/dynamic/second')
    const $2 = cheerio.load(html2)
    const data2 = JSON.parse($2('#props').text())

    expect($2('#dynamic').text()).toBe('dynamic page')
    expect($2('#slug').text()).toBe('second')
    expect(isNaN(data2.random)).toBe(false)
    expect(data2.random).not.toBe(data.random)
  })

  it('should render fallback page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/fallback/first')
    const $ = cheerio.load(html)
    const data = JSON.parse($('#props').text())

    expect($('#fallback').text()).toBe('fallback page')
    expect($('#slug').text()).toBe('first')
    expect(data.hello).toBe('world')

    const html2 = await renderViaHTTP(appPort, '/fallback/first')
    const $2 = cheerio.load(html2)
    const data2 = JSON.parse($2('#props').text())

    expect($2('#fallback').text()).toBe('fallback page')
    expect($2('#slug').text()).toBe('first')
    expect(isNaN(data2.random)).toBe(false)
    expect(data2.random).not.toBe(data.random)

    const html3 = await renderViaHTTP(appPort, '/fallback/second')
    const $3 = cheerio.load(html3)
    const data3 = JSON.parse($3('#props').text())

    expect($3('#fallback').text()).toBe('fallback page')
    expect($3('#slug').text()).toBe('second')
    expect(isNaN(data3.random)).toBe(false)

    const { pageProps: data4 } = JSON.parse(
      await renderViaHTTP(appPort, `/_next/data/${buildId}/fallback/third.json`)
    )
    expect(data4.hello).toBe('world')
    expect(data4.slug).toBe('third')
  })

  it('should render SSR page correctly with x-matched-path', async () => {
    const html = await renderViaHTTP(appPort, '/some-other-path', undefined, {
      headers: {
        'x-matched-path': '/',
      },
    })
    const $ = cheerio.load(html)
    const data = JSON.parse($('#props').text())

    expect($('#index').text()).toBe('index page')
    expect(data.hello).toBe('world')

    const html2 = await renderViaHTTP(appPort, '/some-other-path', undefined, {
      headers: {
        'x-matched-path': '/',
      },
    })
    const $2 = cheerio.load(html2)
    const data2 = JSON.parse($2('#props').text())

    expect($2('#index').text()).toBe('index page')
    expect(isNaN(data2.random)).toBe(false)
    expect(data2.random).not.toBe(data.random)
  })

  it('should render dynamic SSR page correctly with x-matched-path', async () => {
    const html = await renderViaHTTP(appPort, '/some-other-path', undefined, {
      headers: {
        'x-matched-path': '/dynamic/[slug]?slug=first',
      },
    })
    const $ = cheerio.load(html)
    const data = JSON.parse($('#props').text())

    expect($('#dynamic').text()).toBe('dynamic page')
    expect($('#slug').text()).toBe('first')
    expect(data.hello).toBe('world')

    const html2 = await renderViaHTTP(appPort, '/some-other-path', undefined, {
      headers: {
        'x-matched-path': '/dynamic/[slug]?slug=second',
      },
    })
    const $2 = cheerio.load(html2)
    const data2 = JSON.parse($2('#props').text())

    expect($2('#dynamic').text()).toBe('dynamic page')
    expect($2('#slug').text()).toBe('second')
    expect(isNaN(data2.random)).toBe(false)
    expect(data2.random).not.toBe(data.random)

    const html3 = await renderViaHTTP(appPort, '/some-other-path', undefined, {
      headers: {
        'x-matched-path': '/dynamic/[slug]?slug=%5Bslug%5D.json',
        'x-now-route-matches': '1=second&slug=second',
      },
    })
    const $3 = cheerio.load(html3)
    const data3 = JSON.parse($3('#props').text())

    expect($3('#dynamic').text()).toBe('dynamic page')
    expect($3('#slug').text()).toBe('second')
    expect(isNaN(data3.random)).toBe(false)
    expect(data3.random).not.toBe(data.random)
  })

  it('should render fallback page correctly with x-matched-path and routes-matches', async () => {
    const html = await renderViaHTTP(appPort, '/fallback/first', undefined, {
      headers: {
        'x-matched-path': '/fallback/first',
        'x-now-route-matches': '1=first',
      },
    })
    const $ = cheerio.load(html)
    const data = JSON.parse($('#props').text())

    expect($('#fallback').text()).toBe('fallback page')
    expect($('#slug').text()).toBe('first')
    expect(data.hello).toBe('world')

    const html2 = await renderViaHTTP(appPort, `/fallback/[slug]`, undefined, {
      headers: {
        'x-matched-path': '/fallback/[slug]',
        'x-now-route-matches': '1=second',
      },
    })
    const $2 = cheerio.load(html2)
    const data2 = JSON.parse($2('#props').text())

    expect($2('#fallback').text()).toBe('fallback page')
    expect($2('#slug').text()).toBe('second')
    expect(isNaN(data2.random)).toBe(false)
    expect(data2.random).not.toBe(data.random)
  })

  it('should return data correctly with x-matched-path', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `/_next/data/${buildId}/dynamic/first.json`,
      undefined,
      {
        headers: {
          'x-matched-path': '/dynamic/[slug]?slug=first',
        },
      }
    )

    const { pageProps: data } = await res.json()

    expect(data.slug).toBe('first')
    expect(data.hello).toBe('world')

    const res2 = await fetchViaHTTP(
      appPort,
      `/_next/data/${buildId}/fallback/[slug].json`,
      undefined,
      {
        headers: {
          'x-matched-path': `/_next/data/${buildId}/fallback/[slug].json`,
          'x-now-route-matches': '1=second',
        },
      }
    )

    const { pageProps: data2 } = await res2.json()

    expect(data2.slug).toBe('second')
    expect(data2.hello).toBe('world')
  })

  it('should render fallback optional catch-all route correctly with x-matched-path and routes-matches', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/catch-all/[[...rest]]',
      undefined,
      {
        headers: {
          'x-matched-path': '/catch-all/[[...rest]]',
          'x-now-route-matches': '',
        },
      }
    )
    const $ = cheerio.load(html)
    const data = JSON.parse($('#props').text())

    expect($('#catch-all').text()).toBe('optional catch-all page')
    expect(data.params).toEqual({})
    expect(data.hello).toBe('world')

    const html2 = await renderViaHTTP(
      appPort,
      '/catch-all/[[...rest]]',
      undefined,
      {
        headers: {
          'x-matched-path': '/catch-all/[[...rest]]',
          'x-now-route-matches': '1=hello&catchAll=hello',
        },
      }
    )
    const $2 = cheerio.load(html2)
    const data2 = JSON.parse($2('#props').text())

    expect($2('#catch-all').text()).toBe('optional catch-all page')
    expect(data2.params).toEqual({ rest: ['hello'] })
    expect(isNaN(data2.random)).toBe(false)
    expect(data2.random).not.toBe(data.random)

    const html3 = await renderViaHTTP(
      appPort,
      '/catch-all/[[..rest]]',
      undefined,
      {
        headers: {
          'x-matched-path': '/catch-all/[[...rest]]',
          'x-now-route-matches': '1=hello/world&catchAll=hello/world',
        },
      }
    )
    const $3 = cheerio.load(html3)
    const data3 = JSON.parse($3('#props').text())

    expect($3('#catch-all').text()).toBe('optional catch-all page')
    expect(data3.params).toEqual({ rest: ['hello', 'world'] })
    expect(isNaN(data3.random)).toBe(false)
    expect(data3.random).not.toBe(data.random)
  })

  it('should return data correctly with x-matched-path for optional catch-all route', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `/_next/data/${buildId}/catch-all.json`,
      undefined,
      {
        headers: {
          'x-matched-path': '/catch-all/[[...rest]]',
        },
      }
    )

    const { pageProps: data } = await res.json()

    expect(data.params).toEqual({})
    expect(data.hello).toBe('world')

    const res2 = await fetchViaHTTP(
      appPort,
      `/_next/data/${buildId}/catch-all/[[...rest]].json`,
      undefined,
      {
        headers: {
          'x-matched-path': `/_next/data/${buildId}/catch-all/[[...rest]].json`,
          'x-now-route-matches': '1=hello&rest=hello',
        },
      }
    )

    const { pageProps: data2 } = await res2.json()

    expect(data2.params).toEqual({ rest: ['hello'] })
    expect(data2.hello).toBe('world')

    const res3 = await fetchViaHTTP(
      appPort,
      `/_next/data/${buildId}/catch-all/[[...rest]].json`,
      undefined,
      {
        headers: {
          'x-matched-path': `/_next/data/${buildId}/catch-all/[[...rest]].json`,
          'x-now-route-matches': '1=hello/world&rest=hello/world',
        },
      }
    )

    const { pageProps: data3 } = await res3.json()

    expect(data3.params).toEqual({ rest: ['hello', 'world'] })
    expect(data3.hello).toBe('world')
  })

  it('should not apply trailingSlash redirect', async () => {
    for (const path of [
      '/',
      '/dynamic/another/',
      '/dynamic/another',
      '/fallback/first/',
      '/fallback/first',
      '/fallback/another/',
      '/fallback/another',
    ]) {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })

      expect(res.status).toBe(200)
    }
  })

  it('should normalize catch-all rewrite query values correctly', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/some-catch-all/hello/world',
      {
        path: 'hello/world',
      },
      {
        headers: {
          'x-matched-path': '/',
        },
      }
    )
    const $ = cheerio.load(html)
    expect(JSON.parse($('#router').text()).query).toEqual({
      path: ['hello', 'world'],
    })
  })

  it('should bubble error correctly for gip page', async () => {
    errors = []
    const res = await fetchViaHTTP(appPort, '/errors/gip', { crash: '1' })
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('error')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('gip hit an oops')
  })

  it('should bubble error correctly for gssp page', async () => {
    errors = []
    const res = await fetchViaHTTP(appPort, '/errors/gssp', { crash: '1' })
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('error')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('gssp hit an oops')
  })

  it('should bubble error correctly for gsp page', async () => {
    errors = []
    const res = await fetchViaHTTP(appPort, '/errors/gsp/crash')
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('error')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('gsp hit an oops')
  })

  it('should bubble error correctly for API page', async () => {
    errors = []
    const res = await fetchViaHTTP(appPort, '/api/error')
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('error')
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('some error from /api/error')
  })

  it('should normalize optional values correctly for SSP page', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/optional-ssp',
      { rest: '', another: 'value' },
      {
        headers: {
          'x-matched-path': '/optional-ssp/[[...rest]]',
        },
      }
    )

    const html = await res.text()
    const $ = cheerio.load(html)
    const props = JSON.parse($('#props').text())
    expect(props.params).toEqual({})
    expect(props.query).toEqual({ another: 'value' })
  })

  it('should normalize optional values correctly for SSG page', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/optional-ssg',
      { rest: '', another: 'value' },
      {
        headers: {
          'x-matched-path': '/optional-ssg/[[...rest]]',
        },
      }
    )

    const html = await res.text()
    const $ = cheerio.load(html)
    const props = JSON.parse($('#props').text())
    expect(props.params).toEqual({})
  })

  it('should normalize optional values correctly for SSG page with encoded slash', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/optional-ssg/[[...rest]]',
      undefined,
      {
        headers: {
          'x-matched-path': '/optional-ssg/[[...rest]]',
          'x-now-route-matches':
            '1=en%2Fes%2Fhello%252Fworld&rest=en%2Fes%2Fhello%252Fworld',
        },
      }
    )

    const html = await res.text()
    const $ = cheerio.load(html)
    const props = JSON.parse($('#props').text())
    expect(props.params).toEqual({
      rest: ['en', 'es', 'hello/world'],
    })
  })

  it('should normalize optional values correctly for API page', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/api/optional',
      { rest: '', another: 'value' },
      {
        headers: {
          'x-matched-path': '/api/optional/[[...rest]]',
        },
      }
    )

    const json = await res.json()
    expect(json.query).toEqual({ another: 'value' })
    expect(json.url).toBe('/api/optional?another=value')
  })

  it('should match the index page correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/', undefined, {
      headers: {
        'x-matched-path': '/index',
      },
      redirect: 'manual',
    })

    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#index').text()).toBe('index page')
  })

  it('should match the root dyanmic page correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/index', undefined, {
      headers: {
        'x-matched-path': '/[slug]',
      },
      redirect: 'manual',
    })

    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#slug-page').text()).toBe('[slug] page')
  })
})
