/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { check, getRedboxDescription, hasRedbox } from 'next-test-utils'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as Log from './utils/log'

describe('unstable_after()', () => {
  const logFileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logs-'))
  const logFile = path.join(logFileDir, 'logs.jsonl')

  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    env: {
      PERSISTENT_LOG_FILE: logFile,
    },
  })

  beforeEach(() => Log.clearPersistentLog(logFile))

  it('runs in dynamic pages', async () => {
    await next.render('/123/dynamic')
    const logs = Log.readPersistentLog(logFile)
    expect(logs).toContainEqual({
      source: '[page] /[id]/dynamic',
      value: '123',
    })
    expect(logs).toContainEqual({ source: '[layout] /[id]' })
  })

  it('runs in dynamic route handlers', async () => {
    const res = await next.fetch('/route')
    expect(res.status).toBe(200)
    const logs = Log.readPersistentLog(logFile)
    expect(logs).toContainEqual({ source: '[route handler] /route' })
  })

  it('runs in server actions', async () => {
    const browser = await next.browser('/123/with-action')
    expect(Log.readPersistentLog(logFile)).toContainEqual({
      source: '[layout] /[id]',
    })
    await browser.elementByCss('button[type="submit"]').click()

    await check(() => {
      expect(Log.readPersistentLog(logFile)).toContainEqual({
        source: '[action] /[id]/with-action',
        value: '123',
      })
      return 'success'
    }, 'success')
    // TODO: server seems to close before the response fully returns?
  })

  it('is a no-op with `dynamic = "force-static"`', async () => {
    const res = await next.fetch('/static')
    expect(res.status).toBe(200)
    expect(Log.readPersistentLog(logFile)).toHaveLength(0)
  })

  if (isNextDev) {
    it('errors with `dynamic = "error"`', async () => {
      const filePath = 'app/static/page.js'
      const origContent = await next.readFile(filePath)

      try {
        await next.patchFile(filePath, (contents) =>
          contents.replace(
            `export const dynamic = 'force-static'`,
            `export const dynamic = 'error'`
          )
        )
        const browser = await next.browser('/static')

        expect(await hasRedbox(browser)).toBe(true)
        console.log(await getRedboxDescription(browser))
        expect(await getRedboxDescription(browser)).toContain(
          'Route /static with `dynamic = "error"` couldn\'t be rendered statically because it used `unstable_after`'
        )
        expect(Log.readPersistentLog(logFile)).toHaveLength(0)
      } finally {
        await next.patchFile(filePath, origContent)
      }
    })
  }

  it('runs in middleware', async () => {
    const requestId = `${Date.now()}`
    const res = await next.fetch(
      `/middleware/redirect-source?requestId=${requestId}`,
      {
        redirect: 'follow',
        headers: {
          cookie: 'testCookie=testValue',
        },
      }
    )

    expect(res.status).toBe(200)
    const cliLogs = Log.readCliLogs(next.cliOutput)
    expect(cliLogs).toContainEqual({
      source: '[middleware] /middleware/redirect',
      requestId,
      cookies: { testCookie: 'testValue' },
    })
  })

  it.todo('runs in getMetadata()')
  it.todo('runs after the response is sent')
  it.todo('does not allow modifying cookies')
  it.todo('errors when used in client modules')
  it.todo('errors when used in pages dir')
})
