import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import { load } from 'cheerio'
import express from 'express'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { existsSync } from 'node:fs'

const variants = [
  { trailingSlash: false, basePath: '' },
  { trailingSlash: true, basePath: '' },
  { trailingSlash: false, basePath: '/prefix' },
]

for (const { trailingSlash, basePath } of variants) {
  describe(`route-scoped-cache export (trailingSlash=${trailingSlash}, basePath=${basePath})`, () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      // These assertions inspect the exported filesystem and serve it with a
      // plain static server. They specifically verify that no Next runtime is needed.
      skipDeployment: true,
      env: {
        TRAILING_SLASH: trailingSlash ? '1' : '',
        EXPORT_BASE_PATH: basePath,
      },
    })
    if (skipped) return

    let server: Server
    let port: number
    let buildId: string
    const htmlFile = (pathname: string) =>
      `out${pathname}${trailingSlash ? '/index' : ''}.html`

    beforeAll(async () => {
      const { exitCode } = await next.build()
      if (exitCode !== 0) throw new Error(`Fixture build failed: ${exitCode}`)
      buildId = (await next.readFile('.next/BUILD_ID')).trim()
      const app = express()
      const outputDirectory = path.join(next.testDir, 'out')
      app.use(
        basePath || '/',
        (req, _res, nextMiddleware) => {
          // A route can have both known.html and a known/ directory containing
          // segment payloads. Model a static host's try_files $uri.html rule,
          // rather than letting Express redirect to that sidecar directory.
          if (
            existsSync(
              path.join(outputDirectory, decodeURIComponent(req.path) + '.html')
            )
          ) {
            req.url = req.url.replace(/^([^?]*)(.*)$/, '$1.html$2')
          }
          nextMiddleware()
        },
        express.static(outputDirectory, { extensions: ['html'] })
      )
      server = createServer(app)
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      )
      port = (server.address() as AddressInfo).port
    })

    afterAll(async () => {
      if (server)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
    })

    it('normal: publishes the homepage, public asset and custom 404 at public paths', async () => {
      expect(load(await next.readFile('out/index.html'))('#state').text()).toBe(
        'export-home'
      )
      expect(load(await next.readFile('out/404.html'))('#state').text()).toBe(
        'export-not-found'
      )
      expect(await next.readFile('out/plain.txt')).toBe('export-public-file\n')
      const response = await fetchViaHTTP(port, `${basePath}/`)
      expect(response.status).toBe(200)
      const $ = load(await response.text())
      expect($('#pages-link').attr('href')).toBe(
        `${basePath}/posts/known${trailingSlash ? '/' : ''}`
      )
      expect($('#app-link').attr('href')).toBe(
        `${basePath}/article/known${trailingSlash ? '/' : ''}`
      )
      expect((await fetchViaHTTP(port, `${basePath}/absent`)).status).toBe(404)
    })

    it.each(['known', 'index', 'café', 'with space'])(
      'normal: exports Pages HTML and data for %s without route-qualified public filenames',
      async (slug) => {
        const route = `/posts/${slug}`
        expect(
          load(await next.readFile(htmlFile(route)))('#state').text()
        ).toBe(`pages:${slug}`)
        const dataPath = `/_next/data/${buildId}${route}.json`
        expect((await next.readJSON(`out${dataPath}`)).pageProps).toEqual({
          slug,
        })
        const response = await fetchViaHTTP(
          port,
          `${basePath}/posts/${encodeURIComponent(slug)}${trailingSlash ? '/' : ''}`
        )
        expect(response.status).toBe(200)
        expect(load(await response.text())('#state').text()).toBe(
          `pages:${slug}`
        )
        const json = await fetchViaHTTP(port, `${basePath}${dataPath}`)
        expect(json.status).toBe(200)
        expect((await json.json()).pageProps).toEqual({ slug })
      }
    )

    it.each(['known', 'index', 'café', 'with space'])(
      'normal: exports App HTML and RSC for %s without route-qualified public filenames',
      async (slug) => {
        const route = `/article/${slug}`
        expect(
          load(await next.readFile(htmlFile(route)))('#state').text()
        ).toBe(`app:${slug}`)
        const rscPath = `${route}${trailingSlash ? '/index' : ''}.txt`
        expect(await next.readFile(`out${rscPath}`)).toContain(`app:${slug}`)
        const response = await fetchViaHTTP(
          port,
          `${basePath}/article/${encodeURIComponent(slug)}${trailingSlash ? '/' : ''}`
        )
        expect(response.status).toBe(200)
        expect(load(await response.text())('#state').text()).toBe(`app:${slug}`)
        const rsc = await fetchViaHTTP(port, `${basePath}${rscPath}`)
        expect(rsc.status).toBe(200)
        expect(await rsc.text()).toContain(`app:${slug}`)
      }
    )

    it('normal: exports a catch-all route at its concrete nested URL', async () => {
      expect(
        load(await next.readFile(htmlFile('/docs/guide/intro')))(
          '#state'
        ).text()
      ).toBe('docs:guide/intro')
      const response = await fetchViaHTTP(
        port,
        `${basePath}/docs/guide/intro${trailingSlash ? '/' : ''}`
      )
      expect(response.status).toBe(200)
      expect(load(await response.text())('#state').text()).toBe(
        'docs:guide/intro'
      )
    })

    it('normal: exports a static Route Handler body at its public URL', async () => {
      expect(await next.readJSON('out/api/exported')).toEqual({
        route: 'exported-route-handler',
      })
      const response = await fetchViaHTTP(port, `${basePath}/api/exported`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ route: 'exported-route-handler' })
    })

    it('normal: exports client assets referenced by the published HTML', async () => {
      const $ = load(await next.readFile('out/index.html'))
      const scripts = $('script[src]')
        .map((_, element) => $(element).attr('src'))
        .get()
      expect(scripts.length).toBeGreaterThan(0)
      for (const src of scripts) {
        expect(src).toMatch(new RegExp(`^${basePath}/_next/`))
        expect((await fetchViaHTTP(port, src)).status).toBe(200)
      }
    })
  })
}
