/* eslint-env jest */

import http from 'http'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { nextServer } from 'next-test-utils'
import {
  fetchViaHTTP,
  findPort,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
let server
let nextApp
let appPort
let buildId
let requiredFilesManifest
let errors = []

describe('Required Server Files', () => {
  beforeAll(async () => {
    await fs.remove(join(appDir, '.next'))
    await nextBuild(appDir, undefined, {
      env: {
        NOW_BUILDER: '1',
      },
    })

    buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    requiredFilesManifest = await fs.readJSON(
      join(appDir, '.next/required-server-files.json')
    )

    let files = await fs.readdir(join(appDir, '.next'))

    for (const file of files) {
      if (
        file === 'server' ||
        file === 'required-server-files.json' ||
        requiredFilesManifest.files.includes(join('.next', file))
      ) {
        continue
      }
      console.log('removing', join('.next', file))
      await fs.remove(join(appDir, '.next', file))
    }
    await fs.rename(join(appDir, 'pages'), join(appDir, 'pages-bak'))

    nextApp = nextServer({
      conf: {},
      dir: appDir,
      quiet: false,
      minimalMode: true,
    })
    appPort = await findPort()

    server = http.createServer(async (req, res) => {
      try {
        await nextApp.getRequestHandler()(req, res)
      } catch (err) {
        console.error('top-level', err)
        errors.push(err)
        res.statusCode = 500
        res.end('error')
      }
    })
    await new Promise((res, rej) => {
      server.listen(appPort, (err) => (err ? rej(err) : res()))
    })
    console.log(`Listening at ::${appPort}`)
  })
  afterAll(async () => {
    if (server) server.close()
    await fs.rename(join(appDir, 'pages-bak'), join(appDir, 'pages'))
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
      console.log('checking', file)
      expect(await fs.exists(join(appDir, file))).toBe(true)
    }

    expect(await fs.exists(join(appDir, '.next/server'))).toBe(true)
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
    expect(errors[0].message).toContain('gip hit an oops')
  })

  it('should bubble error correctly for gssp page', async () => {
    errors = []
    const res = await fetchViaHTTP(appPort, '/errors/gssp', { crash: '1' })
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('error')
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('gssp hit an oops')
  })

  it('should bubble error correctly for gsp page', async () => {
    errors = []
    const res = await fetchViaHTTP(appPort, '/errors/gsp/crash')
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('error')
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('gsp hit an oops')
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

  it('should handle 404s properly', async () => {
    for (const pathname of [
      '/_next/static/chunks/pages/index-abc123.js',
      '/_next/static/some-file.js',
      '/static/some-file.js',
      '/non-existent',
      '/404',
    ]) {
      const res = await fetchViaHTTP(appPort, pathname, undefined, {
        headers: {
          'x-matched-path': '/404',
          redirect: 'manual',
        },
      })
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('custom 404')
    }
  })
})
