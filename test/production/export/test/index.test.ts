import path from 'path'
import { createNextDescribe } from 'e2e-utils'
import { renderViaHTTP, startStaticServer } from 'next-test-utils'
import { AddressInfo, Server } from 'net'
import cheerio from 'cheerio'

const files = path.join(__dirname, '..')

createNextDescribe(
  'static export',
  {
    files,
  },
  ({ next }) => {
    const outdir = 'out'
    const outNoTrailSlash = 'outNoTrailSlash'
    let server: Server
    let port: number
    let serverNoTrailSlash: Server
    let portNoTrailSlash: number

    beforeAll(async () => {
      const nextConfigPath = 'next.config.js'

      await next.stop()

      const nextConfig = await next.readFile(nextConfigPath)
      await next.build()
      await next.export({ outdir })

      await next.patchFile(
        nextConfigPath,
        nextConfig.replace(`trailingSlash: true`, `trailingSlash: false`)
      )
      await next.build()
      await next.export({ outdir: outNoTrailSlash })
      await next.patchFile(nextConfigPath, nextConfig)

      server = await startStaticServer(path.join(next.testDir, outdir))
      serverNoTrailSlash = await startStaticServer(
        path.join(next.testDir, outNoTrailSlash)
      )
      port = (server.address() as AddressInfo).port
      portNoTrailSlash = (serverNoTrailSlash.address() as AddressInfo).port
    })

    afterAll(async () => {
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => serverNoTrailSlash.close(resolve)),
      ])
    })

    it('should delete existing exported files', async () => {
      const tmpOutDir = 'tmpOutDir'
      const tempfile = path.join(tmpOutDir, 'temp.txt')
      await next.patchFile(tempfile, 'test')
      await next.build()
      await next.export({ outdir: tmpOutDir })
      await expect(next.readFile(tempfile)).rejects.toThrowError()
    })

    const fileExist = async (file: string) =>
      await next
        .readFile(file)
        .then(() => true)
        .catch(() => false)

    it('should honor trailingSlash for 404 page', async () => {
      expect(await fileExist(path.join(outdir, '404/index.html'))).toBe(true)

      // we still output 404.html for backwards compat
      expect(await fileExist(path.join(outdir, '404.html'))).toBe(true)
    })

    it('should handle trailing slash in getStaticPaths', async () => {
      expect(await fileExist(path.join(outdir, 'gssp/foo/index.html'))).toBe(
        true
      )

      expect(await fileExist(path.join(outNoTrailSlash, 'gssp/foo.html'))).toBe(
        true
      )
    })

    it('should only output 404.html without trailingSlash', async () => {
      expect(
        await fileExist(path.join(outNoTrailSlash, '404/index.html'))
      ).toBe(false)

      expect(await fileExist(path.join(outNoTrailSlash, '404.html'))).toBe(true)
    })

    it('should not duplicate /index with trailingSlash', async () => {
      expect(await fileExist(path.join(outdir, 'index/index.html'))).toBe(false)

      expect(await fileExist(path.join(outdir, 'index.html'))).toBe(true)
    })

    // ssr(context)
    // browser(context)
    // dev(devContext)
    // dynamic(context)

    describe('Render via SSR', () => {
      it('should render the home page', async () => {
        const html = await renderViaHTTP(port, '/')
        expect(html).toMatch(/This is the home page/)
      })

      it('should render the about page', async () => {
        const html = await renderViaHTTP(port, '/about')
        expect(html).toMatch(/This is the About page foobar/)
      })

      it('should render links correctly', async () => {
        const html = await renderViaHTTP(port, '/')
        const $ = cheerio.load(html)
        const dynamicLink = $('#dynamic-1').prop('href')
        const filePathLink = $('#path-with-extension').prop('href')
        expect(dynamicLink).toEqual('/dynamic/one/')
        expect(filePathLink).toEqual('/file-name.md')
      })

      it('should render a page with getInitialProps', async () => {
        const html = await renderViaHTTP(port, '/dynamic')
        expect(html).toMatch(/cool dynamic text/)
      })

      it('should render a dynamically rendered custom url page', async () => {
        const html = await renderViaHTTP(port, '/dynamic/one')
        expect(html).toMatch(/next export is nice/)
      })

      it('should render pages with dynamic imports', async () => {
        const html = await renderViaHTTP(port, '/dynamic-imports')
        expect(html).toMatch(/Welcome to dynamic imports/)
      })

      it('should render paths with extensions', async () => {
        const html = await renderViaHTTP(port, '/file-name.md')
        expect(html).toMatch(/this file has an extension/)
      })

      it('should give empty object for query if there is no query', async () => {
        const html = await renderViaHTTP(
          port,
          '/get-initial-props-with-no-query'
        )
        expect(html).toMatch(/Query is: {}/)
      })

      it('should render _error on 404.html even if not provided in exportPathMap', async () => {
        const html = await renderViaHTTP(port, '/404.html')
        // The default error page from the test server
        // contains "404", so need to be specific here
        expect(html).toMatch(/404.*page.*not.*found/i)
      })

      // since exportTrailingSlash is enabled we should allow this
      it('should render _error on /404/index.html', async () => {
        const html = await renderViaHTTP(port, '/404/index.html')
        // The default error page from the test server
        // contains "404", so need to be specific here
        expect(html).toMatch(/404.*page.*not.*found/i)
      })

      it('Should serve static files', async () => {
        const data = await renderViaHTTP(port, '/static/data/item.txt')
        expect(data).toBe('item')
      })

      it('Should serve public files', async () => {
        const html = await renderViaHTTP(port, '/about')
        const data = await renderViaHTTP(port, '/about/data.txt')
        expect(html).toMatch(/This is the About page foobar/)
        expect(data).toBe('data')
      })

      it('Should render dynamic files with query', async () => {
        const html = await renderViaHTTP(port, '/blog/nextjs/comment/test')
        expect(html).toMatch(/Blog post nextjs comment test/)
      })
    })

    describe('API routes export', () => {
      it('Should throw if a route is matched', async () => {
        const nextConfigPath = 'next.config.js'
        const nextConfig = await next.readFile(nextConfigPath)
        await next.patchFile(
          nextConfigPath,
          nextConfig.replace('// API route', `'/data': { page: '/api/data' },`)
        )
        const outdir = 'outApi'
        await next.build()
        const { cliOutput } = await next.export({ outdir })
        await next.patchFile(nextConfigPath, nextConfig)

        expect(cliOutput).toContain(
          'https://nextjs.org/docs/messages/api-routes-static-export'
        )
      })
    })
  }
)
