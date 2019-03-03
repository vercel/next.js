/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  runNextCommand,
  findPort,
  waitFor,
  killApp
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 30

describe('Multi-tab warning', () => {
  it('should show warning when multiple tabs are open in the same browser', async () => {
    const port = await findPort()
    let readyResolve
    const readyPromise = new Promise(resolve => {
      readyResolve = resolve
    })
    const runPromise = runNextCommand(
      ['dev', join(__dirname, '..'), '-p', port],
      {
        instance: child => {
          child.stderr.on('data', chunk => {
            if (/Warn: You are opening multiple tabs of the same site in the same browser, this could cause requests to stall/.test(chunk.toString())) {
              killApp(child)
            }
          })
          child.stdout.on('data', chunk => {
            if (chunk.toString().toLowerCase().indexOf('ready on') > -1) {
              readyResolve()
            }
          })
        }
      }
    )
    await readyPromise
    const browser = await webdriver(port, '/')
    await browser.eval(`window.copy1 = window.open('/', '_blank')`)
    await browser.eval(`window.copy2 = window.open('/', '_blank')`)
    await waitFor(3000)
    await browser.eval(`window.copy1.close()`)
    await browser.eval(`window.copy2.close()`)

    browser.close()
    await runPromise
  })
})
