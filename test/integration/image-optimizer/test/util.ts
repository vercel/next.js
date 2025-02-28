import http from 'http'
import fs from 'fs-extra'
import { join } from 'path'
import assert from 'assert'
import sizeOf from 'image-size'
import {
  check,
  fetchViaHTTP,
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import isAnimated from 'next/dist/compiled/is-animated'
import type { RequestInit } from 'node-fetch'

type SetupTestsCtx = {
  appDir: string
  imagesDir: string
  nextConfigImages?: Partial<import('next').NextConfig['images']>
  isDev?: boolean
}

type RunTestsCtx = SetupTestsCtx & {
  w: number
  app?: import('child_process').ChildProcess
  appDir?: string
  appPort?: number
  nextOutput?: string
}

const largeSize = 1080 // defaults defined in server/config.ts
const animatedWarnText =
  'is an animated image so it will not be optimized. Consider adding the "unoptimized" property to the <Image>.'

export async function serveSlowImage() {
  const port = await findPort()
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost')
    const delay = Number(parsedUrl.searchParams.get('delay')) || 500
    const status = Number(parsedUrl.searchParams.get('status')) || 200

    console.log('delaying image for', delay)
    await waitFor(delay)

    res.statusCode = status

    if (status === 308) {
      res.end('invalid status')
      return
    }
    res.setHeader('content-type', 'image/png')
    res.end(await fs.readFile(join(__dirname, '../app/public/test.png')))
  })

  await new Promise((resolve) => {
    server.listen(port, () => resolve(true))
  })
  console.log(`Started slow image server at ::${port}`)
  return {
    stop() {
      server.close()
    },
    port,
  }
}

export async function fsToJson(dir: string, output = {}) {
  const files = await fs.readdir(dir)
  for (let file of files) {
    const fsPath = join(dir, file)
    const stat = await fs.stat(fsPath)
    if (stat.isDirectory()) {
      output[file] = {}
      await fsToJson(fsPath, output[file])
    } else {
      output[file] = stat.mtime.toISOString()
    }
  }
  return output
}

export async function expectWidth(res, w, { expectAnimated = false } = {}) {
  const buffer = await res.buffer()
  const d = sizeOf(buffer)
  expect(d.width).toBe(w)
  const lengthStr = res.headers.get('Content-Length')
  expect(lengthStr).toBe(Buffer.byteLength(buffer).toString())
  expect(isAnimated(buffer)).toBe(expectAnimated)
}

export const cleanImagesDir = async (ctx: { imagesDir: string }) => {
  console.warn('Cleaning', ctx.imagesDir)
  await fs.remove(ctx.imagesDir)
}

async function expectAvifSmallerThanWebp(
  w: number,
  q: number,
  appPort: number
) {
  const query = { url: '/mountains.jpg', w, q }
  const res1 = await fetchViaHTTP(appPort, '/_next/image', query, {
    headers: {
      accept: 'image/avif',
    },
  })
  expect(res1.status).toBe(200)
  expect(res1.headers.get('Content-Type')).toBe('image/avif')

  const res2 = await fetchViaHTTP(appPort, '/_next/image', query, {
    headers: {
      accept: 'image/webp',
    },
  })
  expect(res2.status).toBe(200)
  expect(res2.headers.get('Content-Type')).toBe('image/webp')

  const res3 = await fetchViaHTTP(appPort, '/_next/image', query, {
    headers: {
      accept: 'image/jpeg',
    },
  })
  expect(res3.status).toBe(200)
  expect(res3.headers.get('Content-Type')).toBe('image/jpeg')

  const avif = (await res1.buffer()).byteLength
  const webp = (await res2.buffer()).byteLength
  const jpeg = (await res3.buffer()).byteLength

  expect(webp).toBeLessThan(jpeg)
  expect(avif).toBeLessThanOrEqual(webp)
}

async function fetchWithDuration(
  appPort: string | number,
  pathname: string,
  query?: Record<string, any> | string,
  opts?: RequestInit
) {
  console.warn('Fetching', pathname, query)
  const start = Date.now()
  const res = await fetchViaHTTP(appPort, pathname, query, opts)
  const buffer = await res.buffer()
  const duration = Date.now() - start
  return { duration, buffer, res }
}

export function runTests(ctx: RunTestsCtx) {
  const { isDev, nextConfigImages } = ctx
  const {
    contentDispositionType = 'attachment',
    domains = [],
    formats = [],
    minimumCacheTTL = 60,
  } = nextConfigImages || {}
  const avifEnabled = formats[0] === 'image/avif'
  let slowImageServer: Awaited<ReturnType<typeof serveSlowImage>>
  beforeAll(async () => {
    slowImageServer = await serveSlowImage()
  })
  afterAll(async () => {
    slowImageServer.stop()
  })

  if (domains.length > 0) {
    it('should normalize invalid status codes', async () => {
      const url = `http://localhost:${slowImageServer.port}/slow.png?delay=${1}&status=308`
      const query = { url, w: ctx.w, q: 39 }
      const opts: RequestInit = {
        headers: { accept: 'image/webp' },
        redirect: 'manual',
      }

      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(500)
    })

    it('should timeout for upstream image exceeding 7 seconds', async () => {
      const url = `http://localhost:${slowImageServer.port}/slow.png?delay=${8000}`
      const query = { url, w: ctx.w, q: 100 }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
      expect(res.status).toBe(504)
    })
  }

  it('should return home page', async () => {
    const res = await fetchViaHTTP(ctx.appPort, '/', null, {})
    expect(await res.text()).toMatch(/Image Optimizer Home/m)
  })

  it('should handle non-ascii characters in image url', async () => {
    const query = { w: ctx.w, q: 90, url: '/äöüščří.png' }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
  })

  it('should maintain icns', async () => {
    const query = { w: ctx.w, q: 90, url: '/test.icns' }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/x-icns')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.icns"`
    )
    await expectWidth(res, 256)
  })

  it('should maintain pic/pct', async () => {
    const query = { w: ctx.w, q: 90, url: '/test.pic' }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/x-pict')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.pic"`
    )
    const actual = await res.text()
    const expected = await fs.readFile(
      join(ctx.appDir, 'public', 'test.pic'),
      'utf8'
    )
    expect(actual).toMatch(expected)
  })

  it('should maintain animated gif', async () => {
    const query = { w: ctx.w, q: 90, url: '/animated.gif' }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/gif')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="animated.gif"`
    )
    await expectWidth(res, 50, { expectAnimated: true })
    expect(ctx.nextOutput).toContain(animatedWarnText)
  })

  it('should maintain animated png', async () => {
    const query = { w: ctx.w, q: 90, url: '/animated.png' }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="animated.png"`
    )
    await expectWidth(res, 100, { expectAnimated: true })
    expect(ctx.nextOutput).toContain(animatedWarnText)
  })

  it('should maintain animated png 2', async () => {
    const query = { w: ctx.w, q: 90, url: '/animated2.png' }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="animated2.png"`
    )
    await expectWidth(res, 1105, { expectAnimated: true })
    expect(ctx.nextOutput).toContain(animatedWarnText)
  })

  it('should maintain animated webp', async () => {
    const query = { w: ctx.w, q: 90, url: '/animated.webp' }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="animated.webp"`
    )
    await expectWidth(res, 400, { expectAnimated: true })
    expect(ctx.nextOutput).toContain(animatedWarnText)
  })

  if (ctx.nextConfigImages?.dangerouslyAllowSVG) {
    it('should maintain vector svg', async () => {
      const query = { w: ctx.w, q: 90, url: '/test.svg' }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Length')).toBe('603')
      expect(res.headers.get('Content-Type')).toContain('image/svg+xml')
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
      )
      // SVG is compressible so will have accept-encoding set from
      // compression
      expect(res.headers.get('Vary')).toMatch(/^Accept(,|$)/)
      expect(res.headers.get('etag')).toBeTruthy()
      expect(res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="test.svg"`
      )
      const actual = await res.text()
      const expected = await fs.readFile(
        join(ctx.appDir, 'public', 'test.svg'),
        'utf8'
      )
      expect(actual).toMatch(expected)
      expect(ctx.nextOutput).not.toContain(
        `The requested resource isn't a valid image`
      )
      expect(ctx.nextOutput).not.toContain(
        `valid but image type is not allowed`
      )
    })
  } else {
    it('should not allow vector svg', async () => {
      const query = { w: ctx.w, q: 35, url: '/test.svg' }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(400)
      expect(await res.text()).toContain('valid but image type is not allowed')
    })

    it('should not allow svg with application header', async () => {
      const query = { w: ctx.w, q: 45, url: '/api/application.svg' }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(400)
      expect(await res.text()).toContain(
        "The requested resource isn't a valid image"
      )
    })

    it('should not allow svg with comma header', async () => {
      const query = { w: ctx.w, q: 55, url: '/api/comma.svg' }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(400)
      expect(await res.text()).toContain(
        "The requested resource isn't a valid image"
      )
    })

    it('should not allow svg with uppercase header', async () => {
      const query = { w: ctx.w, q: 65, url: '/api/uppercase.svg' }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(400)
      expect(await res.text()).toContain(
        '"url" parameter is valid but image type is not allowed'
      )
    })

    it('should not allow svg with wrong header', async () => {
      const query = { w: ctx.w, q: 65, url: '/api/wrong-header.svg' }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(400)
      expect(await res.text()).toContain(
        '"url" parameter is valid but image type is not allowed'
      )
    })
  }

  it('should maintain ico format', async () => {
    const query = { w: ctx.w, q: 90, url: `/test.ico` }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/x-icon')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toMatch(/^Accept(,|$)/)
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.ico"`
    )
    const actual = await res.text()
    const expected = await fs.readFile(
      join(ctx.appDir, 'public', 'test.ico'),
      'utf8'
    )
    expect(actual).toMatch(expected)
  })

  it('should maintain jpg format for old Safari', async () => {
    const accept =
      'image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5'
    const query = { w: ctx.w, q: 90, url: '/test.jpg' }
    const opts = { headers: { accept } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.jpeg"`
    )
  })

  it('should maintain png format for old Safari', async () => {
    const accept =
      'image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5'
    const query = { w: ctx.w, q: 75, url: '/test.png' }
    const opts = { headers: { accept } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.png"`
    )
  })

  it('should downlevel webp format to jpeg for old Safari', async () => {
    const accept =
      'image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5'
    const query = { w: ctx.w, q: 74, url: '/test.webp' }
    const opts = { headers: { accept } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.jpeg"`
    )
    await expectWidth(res, ctx.w)
  })

  it('should downlevel avif format to jpeg for old Safari', async () => {
    const accept =
      'image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5'
    const query = { w: ctx.w, q: 74, url: '/test.avif' }
    const opts = { headers: { accept } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.jpeg"`
    )
    await expectWidth(res, ctx.w)
  })

  it('should fail when url is missing', async () => {
    const query = { w: ctx.w, q: 100 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"url" parameter is required`)
  })

  it('should fail when w is missing', async () => {
    const query = { url: '/test.png', q: 100 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"w" parameter (width) is required`)
  })

  it('should fail when q is missing', async () => {
    const query = { url: '/test.png', w: ctx.w }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"q" parameter (quality) is required`)
  })

  it('should fail when q is greater than 100', async () => {
    const query = { url: '/test.png', w: ctx.w, q: 101 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"q" parameter (quality) must be an integer between 1 and 100`
    )
  })

  it('should fail when q is less than 1', async () => {
    const query = { url: '/test.png', w: ctx.w, q: 0 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"q" parameter (quality) must be an integer between 1 and 100`
    )
  })

  it('should fail when w is 0', async () => {
    const query = { url: '/test.png', w: 0, q: 100 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"w" parameter (width) must be an integer greater than 0`
    )
  })

  it('should fail when w is less than 0', async () => {
    const query = { url: '/test.png', w: -100, q: 100 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"w" parameter (width) must be an integer greater than 0`
    )
  })

  it('should fail when w is not a number', async () => {
    const query = { url: '/test.png', w: 'foo', q: 100 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"w" parameter (width) must be an integer greater than 0`
    )
  })

  it('should fail when w is not an integer', async () => {
    const query = { url: '/test.png', w: 99.9, q: 100 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"w" parameter (width) must be an integer greater than 0`
    )
  })

  it('should fail when q is not a number', async () => {
    const query = { url: '/test.png', w: ctx.w, q: 'foo' }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"q" parameter (quality) must be an integer between 1 and 100`
    )
  })

  it('should fail when q is not an integer', async () => {
    const query = { url: '/test.png', w: ctx.w, q: 99.9 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"q" parameter (quality) must be an integer between 1 and 100`
    )
  })

  it('should fail when domain is not defined in next.config.js', async () => {
    const url = `http://vercel.com/button`
    const query = { url, w: ctx.w, q: 100 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"url" parameter is not allowed`)
  })

  it('should fail when width is not in next.config.js', async () => {
    const query = { url: '/test.png', w: 1000, q: 100 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"w" parameter (width) of 1000 is not allowed`
    )
  })

  it('should emit blur svg when width is 8 in dev but not prod', async () => {
    const query = { url: '/test.png', w: 8, q: 70 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    if (isDev) {
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
      expect(await res.text()).toMatch(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'><filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='20'/><feColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/><feFlood x='0' y='0' width='100%' height='100%'/><feComposite operator='out' in='s'/><feComposite in2='SourceGraphic'/><feGaussianBlur stdDeviation='20'/></filter><image width='100%' height='100%' x='0' y='0' preserveAspectRatio='none' style='filter: url(#b);' href='data:image/webp;base64`
      )
    } else {
      expect(res.status).toBe(400)
      expect(await res.text()).toBe(`"w" parameter (width) of 8 is not allowed`)
    }
  })

  it('should emit blur svg when width is less than 8 in dev but not prod', async () => {
    const query = { url: '/test.png', w: 3, q: 70 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    if (isDev) {
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
      expect(await res.text()).toMatch(
        `svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='20'/><feColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/><feFlood x='0' y='0' width='100%' height='100%'/><feComposite operator='out' in='s'/><feComposite in2='SourceGraphic'/><feGaussianBlur stdDeviation='20'/></filter><image width='100%' height='100%' x='0' y='0' preserveAspectRatio='none' style='filter: url(#b);' href='data:image/webp;base64`
      )
    } else {
      expect(res.status).toBe(400)
      expect(await res.text()).toBe(`"w" parameter (width) of 3 is not allowed`)
    }
  })

  it('should resize relative url and webp Firefox accept header', async () => {
    const query = { url: '/test.png', w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/webp,*/*' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    await expectWidth(res, ctx.w)
  })

  it('should resize relative url and png accept header', async () => {
    const query = { url: '/test.png', w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/png' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.png"`
    )
    await expectWidth(res, ctx.w)
  })

  it('should resize relative url with invalid accept header as png', async () => {
    const query = { url: '/test.png', w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.png"`
    )
    await expectWidth(res, ctx.w)
  })

  it('should resize relative url with invalid accept header as gif', async () => {
    const query = { url: '/test.gif', w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/gif')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.gif"`
    )
    // FIXME: await expectWidth(res, ctx.w)
  })

  it('should resize relative url with invalid accept header as tiff', async () => {
    const query = { url: '/test.tiff', w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/tiff')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.tiff"`
    )
    // FIXME: await expectWidth(res, ctx.w)
  })

  it('should resize gif (not animated)', async () => {
    const query = { url: '/test.gif', w: ctx.w, q: 75 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    await expectWidth(res, ctx.w)
  })

  it('should resize tiff', async () => {
    const query = { url: '/test.tiff', w: ctx.w, q: 75 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    await expectWidth(res, ctx.w)
  })

  it('should resize avif', async () => {
    const query = { url: '/test.avif', w: ctx.w, q: 75 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    await expectWidth(res, ctx.w)
  })

  it('should resize relative url and old Chrome accept header as webp', async () => {
    const query = { url: '/test.png', w: ctx.w, q: 80 }
    const opts = {
      headers: { accept: 'image/webp,image/apng,image/*,*/*;q=0.8' },
    }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    await expectWidth(res, ctx.w)
  })

  if (avifEnabled) {
    it('should resize relative url and new Chrome accept header as avif', async () => {
      const query = { url: '/test.png', w: ctx.w, q: 80 }
      const opts = {
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/avif')
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
      )
      expect(res.headers.get('Vary')).toBe('Accept')
      expect(res.headers.get('etag')).toBeTruthy()
      expect(res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="test.avif"`
      )
      await expectWidth(res, ctx.w)
    })

    it('should resize avif and maintain format', async () => {
      const query = { url: '/test.avif', w: ctx.w, q: 75 }
      const opts = { headers: { accept: 'image/avif' } }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/avif')
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
      )
      expect(res.headers.get('Vary')).toBe('Accept')
      expect(res.headers.get('etag')).toBeTruthy()
      expect(res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="test.avif"`
      )
      await expectWidth(res, ctx.w)
    })

    it('should compress avif smaller than webp at q=100', async () => {
      await expectAvifSmallerThanWebp(ctx.w, 100, ctx.appPort)
    })

    it('should compress avif smaller than webp at q=75', async () => {
      await expectAvifSmallerThanWebp(ctx.w, 75, ctx.appPort)
    })

    it('should compress avif smaller than webp at q=50', async () => {
      await expectAvifSmallerThanWebp(ctx.w, 50, ctx.appPort)
    })
  }

  if (domains.length > 0) {
    it('should resize absolute url from localhost', async () => {
      const url = `http://localhost:${ctx.appPort}/test.png`
      const query = { url, w: ctx.w, q: 80 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/webp')
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
      )
      expect(res.headers.get('Vary')).toBe('Accept')
      expect(res.headers.get('etag')).toBeTruthy()
      expect(res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="test.webp"`
      )
      await expectWidth(res, ctx.w)
    })

    it('should automatically detect image type when content-type is octet-stream', async () => {
      const url = '/png-as-octet-stream'
      const resOrig = await fetchViaHTTP(ctx.appPort, url)
      expect(resOrig.status).toBe(200)
      expect(resOrig.headers.get('Content-Type')).toBe(
        'application/octet-stream'
      )
      const query = { url, w: ctx.w, q: 80 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/webp')
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
      )
      expect(res.headers.get('Vary')).toBe('Accept')
      expect(res.headers.get('etag')).toBeTruthy()
      expect(res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="png-as-octet-stream.webp"`
      )
      await expectWidth(res, ctx.w)
    })

    it('should use cache and stale-while-revalidate when query is the same for external image', async () => {
      await cleanImagesDir(ctx)
      const delay = 500

      if (globalThis.isrImgQuality) {
        globalThis.isrImgQuality++
      } else {
        globalThis.isrImgQuality = 40
      }

      const url = `http://localhost:${slowImageServer.port}/slow.png?delay=${delay}`
      const query = { url, w: ctx.w, q: globalThis.isrImgQuality }
      const opts = { headers: { accept: 'image/webp' } }

      const one = await fetchWithDuration(
        ctx.appPort,
        '/_next/image',
        query,
        opts
      )
      expect(one.duration).toBeGreaterThan(delay)
      expect(one.res.status).toBe(200)
      expect(one.res.headers.get('X-Nextjs-Cache')).toBe('MISS')
      expect(one.res.headers.get('Content-Type')).toBe('image/webp')
      expect(one.res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="slow.webp"`
      )
      const etagOne = one.res.headers.get('etag')

      let json1
      await check(async () => {
        json1 = await fsToJson(ctx.imagesDir)
        return Object.keys(json1).some((dir) => {
          return Object.keys(json1[dir]).some((file) => file.includes(etagOne))
        })
          ? 'success'
          : 'fail'
      }, 'success')

      const two = await fetchWithDuration(
        ctx.appPort,
        '/_next/image',
        query,
        opts
      )
      expect(two.res.status).toBe(200)
      expect(two.res.headers.get('X-Nextjs-Cache')).toBe('HIT')
      expect(two.res.headers.get('Content-Type')).toBe('image/webp')
      expect(two.res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="slow.webp"`
      )
      const json2 = await fsToJson(ctx.imagesDir)
      expect(json2).toStrictEqual(json1)

      if (ctx.nextConfigImages?.minimumCacheTTL) {
        // Wait until expired so we can confirm image is regenerated
        await waitFor(ctx.nextConfigImages.minimumCacheTTL * 1000)

        const [three, four] = await Promise.all([
          fetchWithDuration(ctx.appPort, '/_next/image', query, opts),
          fetchWithDuration(ctx.appPort, '/_next/image', query, opts),
        ])

        expect(three.duration).toBeLessThan(one.duration)
        expect(three.res.status).toBe(200)
        expect(three.res.headers.get('X-Nextjs-Cache')).toBe('STALE')
        expect(three.res.headers.get('Content-Type')).toBe('image/webp')
        expect(three.res.headers.get('Content-Disposition')).toBe(
          `${contentDispositionType}; filename="slow.webp"`
        )

        expect(four.duration).toBeLessThan(one.duration)
        expect(four.res.status).toBe(200)
        expect(four.res.headers.get('X-Nextjs-Cache')).toBe('STALE')
        expect(four.res.headers.get('Content-Type')).toBe('image/webp')
        expect(four.res.headers.get('Content-Disposition')).toBe(
          `${contentDispositionType}; filename="slow.webp"`
        )
        await check(async () => {
          const json4 = await fsToJson(ctx.imagesDir)
          try {
            assert.deepStrictEqual(json4, json1)
            return 'fail'
          } catch (err) {
            return 'success'
          }
        }, 'success')

        const five = await fetchWithDuration(
          ctx.appPort,
          '/_next/image',
          query,
          opts
        )
        // expect(five.duration).toBeLessThan(one.duration) // TODO: investigate why this timing varies randomly
        expect(five.res.status).toBe(200)
        expect(five.res.headers.get('X-Nextjs-Cache')).toBe('HIT')
        expect(five.res.headers.get('Content-Type')).toBe('image/webp')
        expect(five.res.headers.get('Content-Disposition')).toBe(
          `${contentDispositionType}; filename="slow.webp"`
        )
        await check(async () => {
          const json5 = await fsToJson(ctx.imagesDir)
          try {
            assert.deepStrictEqual(json5, json1)
            return 'fail'
          } catch (err) {
            return 'success'
          }
        }, 'success')
      }
    })
  }

  it('should fail when url has file protocol', async () => {
    const url = `file://localhost:${ctx.appPort}/test.png`
    const query = { url, w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"url" parameter is invalid`)
  })

  it('should fail when url has ftp protocol', async () => {
    const url = `ftp://localhost:${ctx.appPort}/test.png`
    const query = { url, w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"url" parameter is invalid`)
  })

  it('should fail when url is too long', async () => {
    const query = { url: `/${'a'.repeat(4000)}`, w: ctx.w, q: 1 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"url" parameter is too long`)
  })

  it('should fail when url is protocol relative', async () => {
    const query = { url: `//example.com`, w: ctx.w, q: 1 }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"url" parameter cannot be a protocol-relative URL (//)`
    )
  })

  describe('recursive url is not allowed', () => {
    it('should fail with relative next image url', async () => {
      const query = { url: `/_next/image?url=test.pngw=1&q=1`, w: ctx.w, q: 1 }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
      expect(res.status).toBe(400)
      expect(await res.text()).toBe(`"url" parameter cannot be recursive`)
    })

    it('should fail with encoded relative image url', async () => {
      const query = {
        url: '%2F_next%2Fimage%3Furl%3Dtest.pngw%3D1%26q%3D1',
        w: ctx.w,
        q: 1,
      }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
      expect(res.status).toBe(400)
      expect(await res.text()).toBe(`"url" parameter is invalid`)
    })

    if (domains.length > 0) {
      it('should pass with absolute next image url', async () => {
        const fullUrl =
          'https://image-optimization-test.vercel.app/_next/image?url=%2Ffrog.jpg&w=1024&q=75'
        const query = { url: fullUrl, w: ctx.w, q: 1 }
        const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
        expect(res.status).toBe(200)
        await expectWidth(res, ctx.w)
      })
    } else {
      it('should fail with absolute next image url', async () => {
        const fullUrl =
          'https://image-optimization-test.vercel.app/_next/image?url=%2Ffrog.jpg&w=1024&q=75'
        const query = { url: fullUrl, w: ctx.w, q: 1 }
        const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
        expect(res.status).toBe(400)
        expect(await res.text()).toBe(`"url" parameter is not allowed`)
      })
    }

    it('should fail with relative image url with assetPrefix', async () => {
      const fullUrl = '/assets/_next/image?url=%2Ftest.png&w=128&q=75'
      const query = { url: fullUrl, w: ctx.w, q: 1 }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
      expect(res.status).toBe(400)
      expect(await res.text()).toBe(`"url" parameter cannot be recursive`)
    })
  })

  it('should fail when internal url is not an image', async () => {
    const url = `/api/no-header`
    const query = { url, w: ctx.w, q: 39 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `Unable to optimize image and unable to fallback to upstream image`
    )
  })

  if (domains.length > 0) {
    it('should fail when url fails to load an image', async () => {
      const url = `http://localhost:${ctx.appPort}/not-an-image`
      const query = { w: ctx.w, url, q: 100 }
      const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, {})
      expect(res.status).toBe(404)
      expect(await res.text()).toBe(
        `"url" parameter is valid but upstream response is invalid`
      )
    })
  }

  it('should use cache and stale-while-revalidate when query is the same for internal image', async () => {
    await cleanImagesDir(ctx)

    if (globalThis.isrImgQuality) {
      globalThis.isrImgQuality++
    } else {
      globalThis.isrImgQuality = 80
    }

    const query = {
      url: '/api/stateful/test.png',
      w: ctx.w,
      q: globalThis.isrImgQuality,
    }
    const opts = { headers: { accept: 'image/webp' } }

    const one = await fetchWithDuration(
      ctx.appPort,
      '/_next/image',
      query,
      opts
    )
    expect(one.res.status).toBe(200)
    expect(one.res.headers.get('X-Nextjs-Cache')).toBe('MISS')
    expect(one.res.headers.get('Content-Type')).toBe('image/webp')
    expect(one.res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    const etagOne = one.res.headers.get('etag')

    let json1
    await check(async () => {
      json1 = await fsToJson(ctx.imagesDir)
      return Object.keys(json1).some((dir) => {
        return Object.keys(json1[dir]).some((file) => file.includes(etagOne))
      })
        ? 'success'
        : 'fail'
    }, 'success')

    const two = await fetchWithDuration(
      ctx.appPort,
      '/_next/image',
      query,
      opts
    )
    expect(two.res.status).toBe(200)
    expect(two.res.headers.get('X-Nextjs-Cache')).toBe('HIT')
    expect(two.res.headers.get('Content-Type')).toBe('image/webp')
    expect(two.res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    const json2 = await fsToJson(ctx.imagesDir)
    expect(json2).toStrictEqual(json1)

    if (ctx.nextConfigImages?.minimumCacheTTL) {
      // Wait until expired so we can confirm image is regenerated
      await waitFor(ctx.nextConfigImages.minimumCacheTTL * 1000)

      const [three, four] = await Promise.all([
        fetchWithDuration(ctx.appPort, '/_next/image', query, opts),
        fetchWithDuration(ctx.appPort, '/_next/image', query, opts),
      ])

      expect(three.res.status).toBe(200)
      expect(three.res.headers.get('X-Nextjs-Cache')).toBe('STALE')
      expect(three.res.headers.get('Content-Type')).toBe('image/webp')
      expect(three.res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="test.webp"`
      )

      expect(four.res.status).toBe(200)
      expect(four.res.headers.get('X-Nextjs-Cache')).toBe('STALE')
      expect(four.res.headers.get('Content-Type')).toBe('image/webp')
      expect(four.res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="test.webp"`
      )
      await check(async () => {
        const json3 = await fsToJson(ctx.imagesDir)
        try {
          assert.deepStrictEqual(json3, json1)
          return 'fail'
        } catch (err) {
          return 'success'
        }
      }, 'success')

      const five = await fetchWithDuration(
        ctx.appPort,
        '/_next/image',
        query,
        opts
      )
      // expect(five.duration).toBeLessThan(one.duration) // TODO: investigate why this timing varies randomly
      expect(five.res.status).toBe(200)
      expect(five.res.headers.get('X-Nextjs-Cache')).toBe('HIT')
      expect(five.res.headers.get('Content-Type')).toBe('image/webp')
      expect(five.res.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="test.webp"`
      )
      await check(async () => {
        const json5 = await fsToJson(ctx.imagesDir)
        try {
          assert.deepStrictEqual(json5, json1)
          return 'fail'
        } catch (err) {
          return 'success'
        }
      }, 'success')
    }
  })

  if (ctx.nextConfigImages?.dangerouslyAllowSVG) {
    it('should use cached image file when parameters are the same for svg', async () => {
      await cleanImagesDir(ctx)

      const query = { url: '/test.svg', w: ctx.w, q: 80 }
      const opts = { headers: { accept: 'image/webp' } }

      const res1 = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res1.status).toBe(200)
      expect(res1.headers.get('X-Nextjs-Cache')).toBe('MISS')
      expect(res1.headers.get('Content-Type')).toBe('image/svg+xml')
      expect(res1.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="test.svg"`
      )
      const etagOne = res1.headers.get('etag')

      let json1
      await check(async () => {
        json1 = await fsToJson(ctx.imagesDir)
        return Object.keys(json1).some((dir) => {
          return Object.keys(json1[dir]).some((file) => file.includes(etagOne))
        })
          ? 'success'
          : 'fail'
      }, 'success')

      const res2 = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res2.status).toBe(200)
      expect(res2.headers.get('X-Nextjs-Cache')).toBe('HIT')
      expect(res2.headers.get('Content-Type')).toBe('image/svg+xml')
      expect(res2.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="test.svg"`
      )
      const json2 = await fsToJson(ctx.imagesDir)
      expect(json2).toStrictEqual(json1)
    })
  }

  it('should use cached image file when parameters are the same for animated gif', async () => {
    await cleanImagesDir(ctx)

    const query = { url: '/animated.gif', w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }

    const res1 = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res1.status).toBe(200)
    expect(res1.headers.get('X-Nextjs-Cache')).toBe('MISS')
    expect(res1.headers.get('Content-Type')).toBe('image/gif')
    expect(res1.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="animated.gif"`
    )

    let json1
    await check(async () => {
      json1 = await fsToJson(ctx.imagesDir)
      return Object.keys(json1).length === 1 ? 'success' : 'fail'
    }, 'success')

    const res2 = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res2.status).toBe(200)
    expect(res2.headers.get('X-Nextjs-Cache')).toBe('HIT')
    expect(res2.headers.get('Content-Type')).toBe('image/gif')
    expect(res2.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="animated.gif"`
    )
    const json2 = await fsToJson(ctx.imagesDir)
    expect(json2).toStrictEqual(json1)
  })

  it('should set 304 status without body when etag matches if-none-match', async () => {
    const query = { url: '/test.jpg', w: ctx.w, q: 80 }
    const opts1 = { headers: { accept: 'image/webp' } }

    const res1 = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts1)
    expect(res1.status).toBe(200)
    expect(res1.headers.get('Content-Type')).toBe('image/webp')
    expect(res1.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res1.headers.get('Vary')).toBe('Accept')
    const etag = res1.headers.get('Etag')
    expect(etag).toBeTruthy()
    expect(res1.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    await expectWidth(res1, ctx.w)

    const opts2 = { headers: { accept: 'image/webp', 'if-none-match': etag } }
    const res2 = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts2)
    expect(res2.status).toBe(304)
    expect(res2.headers.get('Content-Type')).toBeFalsy()
    expect(res2.headers.get('Etag')).toBe(etag)
    expect(res2.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res2.headers.get('Vary')).toBe('Accept')
    expect(res2.headers.get('Content-Disposition')).toBeFalsy()
    expect((await res2.buffer()).length).toBe(0)

    const query3 = { url: '/test.jpg', w: ctx.w, q: 25 }
    const res3 = await fetchViaHTTP(ctx.appPort, '/_next/image', query3, opts2)
    expect(res3.status).toBe(200)
    expect(res3.headers.get('Content-Type')).toBe('image/webp')
    expect(res3.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res3.headers.get('Vary')).toBe('Accept')
    expect(res3.headers.get('Etag')).toBeTruthy()
    expect(res3.headers.get('Etag')).not.toBe(etag)
    expect(res3.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    await expectWidth(res3, ctx.w)
  })

  it('should maintain bmp', async () => {
    const json1 = await fsToJson(ctx.imagesDir)
    expect(json1).toBeTruthy()

    const query = { url: '/test.bmp', w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/bmp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    // bmp is compressible so will have accept-encoding set from
    // compression
    expect(res.headers.get('Vary')).toMatch(/^Accept(,|$)/)
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.bmp"`
    )

    await check(async () => {
      try {
        assert.deepStrictEqual(await fsToJson(ctx.imagesDir), json1)
        return 'expected change, but matched'
      } catch (_) {
        return 'success'
      }
    }, 'success')
  })

  it('should not resize if requested width is larger than original source image', async () => {
    const query = { url: '/test.jpg', w: largeSize, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=${isDev ? 0 : minimumCacheTTL}, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(res.headers.get('Content-Disposition')).toBe(
      `${contentDispositionType}; filename="test.webp"`
    )
    await expectWidth(res, 400)
  })

  it('should set cache-control to immutable for static images', async () => {
    if (!ctx.isDev) {
      const filename = 'test'
      const query = {
        url: `/_next/static/media/${filename}.fab2915d.jpg`,
        w: ctx.w,
        q: 100,
      }
      const opts = { headers: { accept: 'image/webp' } }

      const res1 = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res1.status).toBe(200)
      expect(res1.headers.get('Cache-Control')).toBe(
        'public, max-age=315360000, immutable'
      )
      expect(res1.headers.get('Vary')).toBe('Accept')
      expect(res1.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="${filename}.webp"`
      )
      await expectWidth(res1, ctx.w)

      // Ensure subsequent request also has immutable header
      const res2 = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
      expect(res2.status).toBe(200)
      expect(res2.headers.get('Cache-Control')).toBe(
        'public, max-age=315360000, immutable'
      )
      expect(res2.headers.get('Vary')).toBe('Accept')
      expect(res2.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="${filename}.webp"`
      )
      await expectWidth(res2, ctx.w)
    }
  })

  it("should error if the resource isn't a valid image", async () => {
    const query = { url: '/test.txt', w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("The requested resource isn't a valid image.")
  })

  it('should error if the image file does not exist', async () => {
    const query = { url: '/does_not_exist.jpg', w: ctx.w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(ctx.appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("The requested resource isn't a valid image.")
  })

  if (domains.length > 0) {
    it('should handle concurrent requests', async () => {
      await cleanImagesDir(ctx)
      const delay = 500
      const query = {
        url: `http://localhost:${slowImageServer.port}/slow.png?delay=${delay}`,
        w: ctx.w,
        q: 80,
      }
      const opts = { headers: { accept: 'image/webp,*/*' } }
      const [res1, res2, res3] = await Promise.all([
        fetchViaHTTP(ctx.appPort, '/_next/image', query, opts),
        fetchViaHTTP(ctx.appPort, '/_next/image', query, opts),
        fetchViaHTTP(ctx.appPort, '/_next/image', query, opts),
      ])

      if (res1.status !== 200) {
        console.error(await res1.text())
      }

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)
      expect(res3.status).toBe(200)

      expect(res1.headers.get('Content-Type')).toBe('image/webp')
      expect(res1.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="slow.webp"`
      )
      expect(res2.headers.get('Content-Type')).toBe('image/webp')
      expect(res2.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="slow.webp"`
      )
      expect(res3.headers.get('Content-Type')).toBe('image/webp')
      expect(res3.headers.get('Content-Disposition')).toBe(
        `${contentDispositionType}; filename="slow.webp"`
      )

      await expectWidth(res1, ctx.w)
      await expectWidth(res2, ctx.w)
      await expectWidth(res3, ctx.w)

      await check(async () => {
        const json1 = await fsToJson(ctx.imagesDir)
        return Object.keys(json1).length === 1 ? 'success' : 'fail'
      }, 'success')

      const xCache = [res1, res2, res3]
        .map((r) => r.headers.get('X-Nextjs-Cache'))
        .sort((a, b) => b.localeCompare(a))

      // Since the first request is a miss it blocks
      // until the cache be populated so all concurrent
      // requests receive the same response
      expect(xCache).toEqual(['MISS', 'MISS', 'MISS'])
    })
  }
}

export const setupTests = (ctx: SetupTestsCtx) => {
  const nextConfig = new File(join(ctx.appDir, 'next.config.js'))

  describe('dev support w/o next.config.js', () => {
    if (ctx.nextConfigImages) {
      // skip this test because it requires next.config.js
      return
    }
    const size = 384 // defaults defined in server/config.ts
    const curCtx: RunTestsCtx = {
      ...ctx,
      w: size,
      isDev: true,
    }

    beforeAll(async () => {
      const json = JSON.stringify({
        experimental: {
          outputFileTracingRoot: join(__dirname, '../../../..'),
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      curCtx.nextOutput = ''
      curCtx.appPort = await findPort()
      curCtx.app = await launchApp(curCtx.appDir, curCtx.appPort, {
        onStderr(msg) {
          curCtx.nextOutput += msg
        },
        cwd: curCtx.appDir,
      })
      await cleanImagesDir(ctx)
    })
    afterAll(async () => {
      nextConfig.restore()
      if (curCtx.app) await killApp(curCtx.app)
    })

    runTests(curCtx)
  })

  describe('dev support with next.config.js', () => {
    const size = 400
    const curCtx: RunTestsCtx = {
      ...ctx,
      w: size,
      isDev: true,
      nextConfigImages: {
        domains: [
          'localhost',
          '127.0.0.1',
          'example.com',
          'assets.vercel.com',
          'image-optimization-test.vercel.app',
        ],
        formats: ['image/avif', 'image/webp'] as any,
        deviceSizes: [largeSize],
        imageSizes: [size],
        ...ctx.nextConfigImages,
      },
    }
    beforeAll(async () => {
      const json = JSON.stringify({
        images: curCtx.nextConfigImages,
        experimental: {
          outputFileTracingRoot: join(__dirname, '../../../..'),
        },
      })
      curCtx.nextOutput = ''
      nextConfig.replace('{ /* replaceme */ }', json)
      await cleanImagesDir(ctx)
      curCtx.appPort = await findPort()
      curCtx.app = await launchApp(curCtx.appDir, curCtx.appPort, {
        onStderr(msg) {
          curCtx.nextOutput += msg
        },
        cwd: curCtx.appDir,
      })
    })
    afterAll(async () => {
      nextConfig.restore()
      if (curCtx.app) await killApp(curCtx.app)
    })

    runTests(curCtx)
  })
  ;(process.env.TURBOPACK_DEV || process.env.TURBOPACK_BUILD
    ? describe.skip
    : describe)('Production Mode Server support w/o next.config.js', () => {
    if (ctx.nextConfigImages) {
      // skip this test because it requires next.config.js
      return
    }
    const size = 384 // defaults defined in server/config.ts
    const curCtx: RunTestsCtx = {
      ...ctx,
      w: size,
      isDev: false,
    }
    beforeAll(async () => {
      const json = JSON.stringify({
        experimental: {
          outputFileTracingRoot: join(__dirname, '../../../..'),
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      curCtx.nextOutput = ''
      await nextBuild(curCtx.appDir)
      await cleanImagesDir(ctx)
      curCtx.appPort = await findPort()
      curCtx.app = await nextStart(curCtx.appDir, curCtx.appPort, {
        onStderr(msg) {
          curCtx.nextOutput += msg
        },
        cwd: curCtx.appDir,
      })
    })
    afterAll(async () => {
      nextConfig.restore()
      if (curCtx.app) await killApp(curCtx.app)
    })

    runTests(curCtx)
  })
  ;(process.env.TURBOPACK_DEV || process.env.TURBOPACK_BUILD
    ? describe.skip
    : describe)('Production Mode Server support with next.config.js', () => {
    const size = 399
    const curCtx: RunTestsCtx = {
      ...ctx,
      w: size,
      isDev: false,
      nextConfigImages: {
        domains: [
          'localhost',
          '127.0.0.1',
          'example.com',
          'assets.vercel.com',
          'image-optimization-test.vercel.app',
        ],
        formats: ['image/avif', 'image/webp'] as any,
        deviceSizes: [size, largeSize],
        ...ctx.nextConfigImages,
      },
    }
    beforeAll(async () => {
      const json = JSON.stringify({
        images: curCtx.nextConfigImages,
        experimental: {
          outputFileTracingRoot: join(__dirname, '../../../..'),
        },
      })
      curCtx.nextOutput = ''
      nextConfig.replace('{ /* replaceme */ }', json)
      await nextBuild(curCtx.appDir)
      await cleanImagesDir(ctx)
      curCtx.appPort = await findPort()
      curCtx.app = await nextStart(curCtx.appDir, curCtx.appPort, {
        onStderr(msg) {
          curCtx.nextOutput += msg
        },
        cwd: curCtx.appDir,
      })
    })
    afterAll(async () => {
      nextConfig.restore()
      if (curCtx.app) await killApp(curCtx.app)
    })

    runTests(curCtx)
  })
}
