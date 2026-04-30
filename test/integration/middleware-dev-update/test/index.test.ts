import {
  check,
  fetchViaHTTP,
  File,
  findPort,
  killApp,
  launchApp,
  retry,
} from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

let app
let appPort
const context = {
  appDir: join(__dirname, '../'),
  logs: { output: '', stdout: '', stderr: '' },
  middleware: new File(join(__dirname, '../middleware.js')),
}

describe('Middleware development errors', () => {
  beforeEach(async () => {
    context.logs = { output: '', stdout: '', stderr: '' }
    appPort = await findPort()
    app = await launchApp(context.appDir, appPort, {
      onStdout(msg) {
        context.logs.output += msg
        context.logs.stdout += msg
      },
      onStderr(msg) {
        context.logs.output += msg
        context.logs.stderr += msg
      },
    })
  })

  afterEach(async () => {
    context.middleware.restore()
    if (app) {
      await killApp(app)
    }
  })

  async function assertMiddlewareFetch(hasMiddleware, path = '/') {
    await check(async () => {
      const res = await fetchViaHTTP(appPort, path)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBe(
        hasMiddleware ? 'true' : null
      )
      return 'success'
    }, 'success')
  }

  async function assertMiddlewareRender(hasMiddleware, path = '/') {
    const browser = await webdriver(appPort, path)
    const fromMiddleware = await browser.elementById('from-middleware').text()
    expect(fromMiddleware).toBe(hasMiddleware ? 'true' : 'null')
  }

  describe('when middleware is removed', () => {
    beforeEach(async () => {
      await assertMiddlewareFetch(true)
      context.middleware.delete()
    })

    it('sends response correctly', async () => {
      await assertMiddlewareFetch(false)
      await assertMiddlewareRender(false)

      // assert no extra message on stderr
      expect(context.logs.stderr).not.toContain('error')
    })
  })

  describe('when middleware is removed and re-added', () => {
    beforeEach(async () => {
      await assertMiddlewareFetch(true)
      context.middleware.delete()
      await assertMiddlewareFetch(false)
      context.middleware.restore()
    })

    it('sends response correctly', async () => {
      await assertMiddlewareFetch(true)
      await assertMiddlewareRender(true)
    })
  })

  describe('when middleware is added', () => {
    beforeEach(async () => {
      context.middleware.delete()
      await assertMiddlewareFetch(false)
      context.middleware.restore()
    })

    it('sends response correctly', async () => {
      await retry(() => assertMiddlewareFetch(true))
      await assertMiddlewareRender(true)
    })
  })

  describe('when matcher is added', () => {
    beforeEach(async () => {
      context.middleware.write(
        context.middleware.originalContent +
          `
        export const config = {
          matcher: '/',
        }
      `
      )

      await assertMiddlewareFetch(true)

      context.middleware.write(
        context.middleware.originalContent +
          `
        export const config = {
          matcher: '/asdf',
        }
      `
      )
    })

    it('sends response correctly', async () => {
      await retry(() => assertMiddlewareFetch(true, '/asdf'))
      await retry(() => assertMiddlewareRender(true, '/asdf'))
    })
  })
})
