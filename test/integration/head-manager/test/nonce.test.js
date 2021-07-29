/* eslint-env jest */
import { join } from 'path'
import {
  findPort,
  waitFor,
  killApp,
  initNextServerScript,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import clone from 'clone'

const ctx = {}
jest.setTimeout(1000 * 60 * 5)

const startServer = async (includeCsp = true) => {
  const scriptPath = join(__dirname, '../server.js')
  ctx.appPort = await findPort()
  const env = Object.assign({}, clone(process.env), {
    PORT: `${ctx.appPort}`,
    INCLUDE_CSP: includeCsp,
  })

  ctx.server = await initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/
  )
}

describe('nonce', () => {
  afterAll(async () => {
    if (ctx.browser) await ctx.browser.close()
    killApp(ctx.server)
  })

  it('Re-rendering should not re-execute the script', async () => {
    ctx.server = await startServer()
    ctx.browser = await webdriver(ctx.appPort, '/nonce')
    await waitFor(5000)

    expect(await ctx.browser.eval(`window.scriptExecutionIds`)).toEqual([
      'src-1.js',
    ])
    ctx.browser.elementByCss('#force-rerender').click()
    await waitFor(100)
    expect(await ctx.browser.eval(`window.scriptExecutionIds`)).toEqual([
      'src-1.js',
    ])
  })
})
