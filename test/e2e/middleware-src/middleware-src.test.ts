import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'

const srcHeader = 'X-From-Src-Middleware'
const rootHeader = 'X-From-Root-Middleware'

describe('middleware-src', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (isNextDev) {
    beforeAll(async () => {
      await next.start()
    })
  }

  describe('Middleware in src/ folder', () => {
    if (isNextDev) {
      it('loads and runs src middleware', async () => {
        const response = await next.fetch('/post-1')
        expect(response.headers.has(srcHeader)).toBe(false)
        expect(response.headers.has(`${srcHeader}-TS`)).toBe(true)
      })
    }

    if (!isNextDev) {
      it('should warn about middleware on export', async () => {
        await next.patchFile(
          'next.config.js',
          "module.exports = { output: 'export' }"
        )
        await next.build()
        expect(next.cliOutput).toContain(
          'Statically exporting a Next.js application via `next export` disables API routes and middleware.'
        )
      })
    }
  })

  describe('Middleware in src/ and / folders', () => {
    beforeAll(async () => {
      const pagesContent = await next.readFile('src/pages/index.js')
      await next.patchFile('pages/index.js', pagesContent)
      await next.patchFile(
        'middleware.js',
        `
import { NextResponse } from 'next/server'

export default function () {
  const response = NextResponse.next()
  response.headers.set('${rootHeader}', 'true')
  return response
}`
      )
      await next.patchFile(
        'middleware.ts',
        `
import { NextResponse } from 'next/server'

export default function () {
  const response = NextResponse.next()
  response.headers.set('${rootHeader}-TS', 'true')
  return response
}`
      )
    })

    afterAll(async () => {
      await next.deleteFile('pages/index.js').catch(() => {})
      await next.deleteFile('middleware.js').catch(() => {})
      await next.deleteFile('middleware.ts').catch(() => {})
    })

    if (isNextDev) {
      it('loads and runs only root middleware', async () => {
        await retry(async () => {
          const response = await next.fetch('/post-1')
          expect(response.headers.has(srcHeader)).toBe(false)
          expect(response.headers.has(`${srcHeader}-TS`)).toBe(false)
          expect(response.headers.has(rootHeader)).toBe(false)
          expect(response.headers.has(`${rootHeader}-TS`)).toBe(true)
        })
      })
    }

    if (!isNextDev) {
      it('should warn about middleware on export', async () => {
        await next.patchFile(
          'next.config.js',
          "module.exports = { output: 'export' }"
        )
        await next.build()
        expect(next.cliOutput).toContain(
          'Statically exporting a Next.js application via `next export` disables API routes and middleware.'
        )
      })
    }
  })
})
