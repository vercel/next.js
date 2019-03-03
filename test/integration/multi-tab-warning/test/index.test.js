/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import AbortController from 'abort-controller'
import {
  runNextCommand,
  fetchViaHTTP,
  findPort,
  killApp
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 30
let port

const doPing = () => {
  const controller = new AbortController()
  const signal = controller.signal
  fetchViaHTTP(port, '/_next/on-demand-entries-ping', { page: '/' }, {
    signal,
    headers: {
      'user-agent': 'next-testing'
    }
  })
  return controller
}

describe('Multi-tab warning', () => {
  it('should show warning when multiple tabs are open in the same browser', async () => {
    port = await findPort()
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
    const controllers = [1, 2, 3].map(() => doPing())

    await runPromise
    controllers.forEach(controller => controller.abort())
  })
})
