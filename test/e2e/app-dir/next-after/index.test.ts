/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as Log from './utils/log'

describe('unstable_after()', () => {
  const logFileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logs-'))
  const logFile = path.join(logFileDir, 'logs.jsonl')

  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      PERSISTENT_LOG_FILE: logFile,
    },
  })

  beforeEach(() => Log.clearPersistentLog(logFile))

  it('runs in dynamic pages', async () => {
    await next.render$('/123/dynamic')
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
  })

  it.todo('runs after the response is sent')
  it.todo('does not allow modifying cookies')
  it.todo('errors when used in client modules')
  it.todo('errors when used in pages dir')
  it.todo('warns in static pages')
})
