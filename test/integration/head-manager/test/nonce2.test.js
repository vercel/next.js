/* eslint-env jest */
import { join } from 'path'
import {
  findPort,
  waitFor,
  killApp,
  initNextServerScript,
  launchApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { startServer } from '../start-server'

const ctx = {}
// jest.setTimeout(1000 * 60 * 5)

describe('nonce', () => {
  afterAll(async () => {
    if (ctx.browser) await ctx.browser.close()
    ctx.server.close()
  })

  it('Re-rendering should not re-execute the script', async () => {
    ctx.appPort = await findPort()
    ctx.server = await startServer(ctx.appPort)
    ctx.browser = await webdriver(ctx.appPort, '/nonce')
    await waitFor(500)

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
