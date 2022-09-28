import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

describe('skip-trailing-slash-redirect', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, 'app')),
      dependencies: {},
      nextConfig: {
        experimental: {
          skipTrailingSlashRedirect: true,
        },
        async redirects() {
          return [
            {
              source: '/redirect-me',
              destination: '/another',
              permanent: false,
            },
          ]
        },
        async rewrites() {
          return [
            {
              source: '/rewrite-me',
              destination: '/another',
            },
          ]
        },
      },
    })
  })
  afterAll(() => next.destroy())

  if ((global as any).isNextStart) {
    it('should not have trailing slash redirects in manifest', async () => {
      const routesManifest = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )

      expect(
        routesManifest.redirects.some((redirect) => {
          return (
            redirect.statusCode === 308 &&
            (redirect.destination === '/:path+' ||
              redirect.destination === '/:path+/')
          )
        })
      ).toBe(false)
    })
  }

  it('should apply config redirect correctly', async () => {
    const res = await fetchViaHTTP(next.url, '/redirect-me', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location'), 'http://n').pathname).toBe(
      '/another'
    )
  })

  it('should apply config rewrites correctly', async () => {
    const res = await fetchViaHTTP(next.url, '/rewrite-me', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('another page')
  })

  it('should not apply trailing slash redirect (with slash)', async () => {
    const res = await fetchViaHTTP(next.url, '/another/', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('another page')
  })

  it('should not apply trailing slash redirect (without slash)', async () => {
    const res = await fetchViaHTTP(next.url, '/another', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('another page')
  })

  it('should respond to index correctly', async () => {
    const res = await fetchViaHTTP(next.url, '/', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('index page')
  })

  it('should respond to dynamic route correctly', async () => {
    const res = await fetchViaHTTP(next.url, '/blog/first', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('blog page')
  })

  it('should navigate client side correctly', async () => {
    const browser = await webdriver(next.url, '/')

    expect(await browser.eval('location.pathname')).toBe('/')

    await browser.elementByCss('#to-another').click()
    await browser.waitForElementByCss('#another')

    expect(await browser.eval('location.pathname')).toBe('/another')
    await browser.back()
    await browser.waitForElementByCss('#index')

    expect(await browser.eval('location.pathname')).toBe('/')

    await browser.elementByCss('#to-blog-first').click()
    await browser.waitForElementByCss('#blog')

    expect(await browser.eval('location.pathname')).toBe('/blog/first')
  })
})
