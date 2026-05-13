import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Middleware development errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let middlewareContent: string
  beforeAll(async () => {
    middlewareContent = await next.readFile('middleware.js')
  })

  async function assertMiddlewareFetch(hasMiddleware: boolean, path = '/') {
    await retry(async () => {
      const res = await next.fetch(path)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBe(
        hasMiddleware ? 'true' : null
      )
    })
  }

  async function assertMiddlewareRender(hasMiddleware: boolean, path = '/') {
    const browser = await next.browser(path)
    await retry(async () => {
      const fromMiddleware = await browser.elementById('from-middleware').text()
      expect(fromMiddleware).toBe(hasMiddleware ? 'true' : 'null')
    })
  }

  describe('when middleware is removed', () => {
    let stderrLog = ''
    let onStderr: ((msg: string) => void) | undefined

    beforeEach(async () => {
      stderrLog = ''
      onStderr = (msg: string) => {
        stderrLog += msg
      }
      next.on('stderr', onStderr)

      await next.patchFile('middleware.js', middlewareContent)
      await assertMiddlewareFetch(true)
      await next.deleteFile('middleware.js')
    })

    afterEach(async () => {
      if (onStderr) {
        next.off('stderr', onStderr)
      }
      await next.patchFile('middleware.js', middlewareContent)
    })

    it('sends response correctly', async () => {
      await assertMiddlewareFetch(false)
      await assertMiddlewareRender(false)

      // Mirrors integration `assert no extra message on stderr` (context.logs.stderr).
      await retry(async () => {
        expect(stderrLog).not.toContain('error')
      })
    })
  })

  describe('when middleware is removed and re-added', () => {
    beforeEach(async () => {
      await next.patchFile('middleware.js', middlewareContent)
      await assertMiddlewareFetch(true)
      await next.deleteFile('middleware.js')
      await assertMiddlewareFetch(false)
      await next.patchFile('middleware.js', middlewareContent)
    })

    it('sends response correctly', async () => {
      await assertMiddlewareFetch(true)
      await assertMiddlewareRender(true)
    })
  })

  describe('when middleware is added', () => {
    beforeEach(async () => {
      await next.deleteFile('middleware.js')
      await assertMiddlewareFetch(false)
      await next.patchFile('middleware.js', middlewareContent)
    })

    it('sends response correctly', async () => {
      await retry(() => assertMiddlewareFetch(true))
      await assertMiddlewareRender(true)
    })
  })

  describe('when matcher is added', () => {
    beforeEach(async () => {
      await next.patchFile(
        'middleware.js',
        middlewareContent +
          `
        export const config = {
          matcher: '/',
        }
      `
      )
      await assertMiddlewareFetch(true)

      await next.patchFile(
        'middleware.js',
        middlewareContent +
          `
        export const config = {
          matcher: '/asdf',
        }
      `
      )
    })

    afterEach(async () => {
      await next.patchFile('middleware.js', middlewareContent)
    })

    it('sends response correctly', async () => {
      await retry(() => assertMiddlewareFetch(true, '/asdf'))
      await retry(() => assertMiddlewareRender(true, '/asdf'))
    })
  })
})
