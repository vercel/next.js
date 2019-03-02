/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  runNextCommand,
  findPort,
  waitFor
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 30

describe('Promise in next config', () => {
  it('should show warning when multiple tabs are open in the same browser', async () => {
    const port = await findPort()

    const runPromise = runNextCommand(
      ['dev', join(__dirname, '..'), '-p', port],
      { stderr: true }
    ).then(({ stderr }) => {
      expect(stderr).toMatch(/Warn: You are opening multiple tabs of the same site in the same browser, this could cause requests to stall/)
    })
    await waitFor(1000)
    const browser = await webdriver(port, '/')
    await browser.eval(`window.copy1 = window.open('/', '_blank')`)
    await browser.eval(`window.copy2 = window.open('/', '_blank')`)
    await waitFor(1000)
    await browser.eval(`window.copy1.close()`)
    await browser.eval(`window.copy2.close()`)

    browser.close()
    await runPromise
  })
})
