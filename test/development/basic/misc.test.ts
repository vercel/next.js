import url from 'url'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'

describe.each([[''], ['/docs']])(
  'misc basic dev tests, basePath: %p',
  (basePath: string) => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'misc/pages')),
          public: new FileRef(join(__dirname, 'misc/public')),
        },
        nextConfig: {
          basePath,
        },
      })
    })
    afterAll(() => next.destroy())

    it('should set process.env.NODE_ENV in development', async () => {
      const browser = await webdriver(next.url, basePath + '/process-env')
      const nodeEnv = await browser.elementByCss('#node-env').text()
      expect(nodeEnv).toBe('development')
      await browser.close()
    })

    it('should allow access to public files', async () => {
      const data = await renderViaHTTP(next.url, basePath + '/data/data.txt')
      expect(data).toBe('data')

      const legacy = await renderViaHTTP(
        next.url,
        basePath + '/static/legacy.txt'
      )
      expect(legacy).toMatch(`new static folder`)
    })

    describe('With Security Related Issues', () => {
      it('should not allow accessing files outside .next/static and .next/server directory', async () => {
        const pathsToCheck = [
          basePath + '/_next/static/../BUILD_ID',
          basePath + '/_next/static/../routes-manifest.json',
        ]
        for (const path of pathsToCheck) {
          const res = await fetchViaHTTP(next.url, path)
          const text = await res.text()
          try {
            expect(res.status).toBe(404)
            expect(text).toMatch(/This page could not be found/)
          } catch (err) {
            throw new Error(`Path ${path} accessible from the browser`)
          }
        }
      })

      it('should handle encoded / value for trailing slash correctly', async () => {
        const res = await fetchViaHTTP(
          next.url,
          basePath + '/%2fexample.com/',
          undefined,
          {
            redirect: 'manual',
          }
        )

        const { pathname, hostname } = url.parse(
          res.headers.get('location') || ''
        )
        expect(res.status).toBe(308)
        expect(pathname).toBe(basePath + '/%2fexample.com')
        expect(hostname).not.toBe('example.com')
        const text = await res.text()
        expect(text).toEqual(basePath + '/%2fexample.com')
      })
    })

    async function getLogs$(path) {
      let foundLog = false
      let browser
      try {
        browser = await webdriver(next.url, path)
        const browserLogs = await browser.log('browser')

        browserLogs.forEach((log) => {
          if (log.message.includes('Next.js auto-prefetches automatically')) {
            foundLog = true
          }
        })
      } finally {
        if (browser) {
          await browser.close()
        }
      }
      return foundLog
    }
    describe('Development Logs', () => {
      it('should warn when prefetch is true', async () => {
        const foundLog = await getLogs$(basePath + '/development-logs')
        expect(foundLog).toBe(true)
      })
      it('should not warn when prefetch is false', async () => {
        const foundLog = await getLogs$(
          basePath + '/development-logs/link-with-prefetch-false'
        )
        expect(foundLog).toBe(false)
      })
      it('should not warn when prefetch is not specified', async () => {
        const foundLog = await getLogs$(
          basePath + '/development-logs/link-with-no-prefetch'
        )
        expect(foundLog).toBe(false)
      })
    })
  }
)
