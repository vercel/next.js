/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  nextBuild,
  nextStart,
  isAppRunning,
  waitFor,
} from 'next-test-utils'
import { LONG_RUNNING_MS } from '../pages/api/long-running'

const appDir = join(__dirname, '../')
let appPort
let app

function runTests(dev = false) {
  if (dev) {
    it('should shut down child immediately', async () => {
      // let the dev server compile the route before running the test
      await expect(
        fetchViaHTTP(appPort, '/api/long-running')
      ).resolves.toBeTruthy()

      let responseResolved = false
      let killAppResolved = false
      const resPromise = fetchViaHTTP(appPort, '/api/long-running').then(
        (res) => {
          responseResolved = true
          return res
        }
      )
      const killAppPromise = killApp(app, LONG_RUNNING_MS * 2).then(() => {
        killAppResolved = true
      })
      expect(isAppRunning(app)).toBe(true)

      // `next dev` should kill the child immediately
      let start = Date.now()
      await expect(resPromise).rejects.toThrow(/socket hang up/)
      let end = Date.now()
      expect(end - start).toBeLessThan(LONG_RUNNING_MS)
      expect(responseResolved).toBe(false)

      // `next dev` parent process is still running cleanup
      expect(isAppRunning(app)).toBe(true)
      expect(killAppResolved).toBe(false)

      // App finally shuts down
      await killAppPromise
      expect(isAppRunning(app)).toBe(false)
      expect(killAppResolved).toBe(true)
    })
  } else {
    it('should wait for requests to complete before exiting', async () => {
      let responseResolved = false
      let killAppResolved = false
      const resPromise = fetchViaHTTP(appPort, '/api/long-running')
        .then((res) => {
          responseResolved = true
          return res
        })
        .catch(() => {})
      const killAppPromise = killApp(app, LONG_RUNNING_MS * 2).then(() => {
        killAppResolved = true
      })
      expect(isAppRunning(app)).toBe(true)

      // Long running response should still be running after a bit
      await waitFor(LONG_RUNNING_MS / 2)
      expect(isAppRunning(app)).toBe(true)
      expect(responseResolved).toBe(false)
      expect(killAppResolved).toBe(false)

      // App responds as expected without being interrupted
      const res = await resPromise
      expect(res?.status).toBe(200)
      expect(await res?.json()).toStrictEqual({ hello: 'world' })

      // App is still running briefly after response returns
      expect(isAppRunning(app)).toBe(true)
      expect(responseResolved).toBe(true)
      expect(killAppResolved).toBe(false)

      // App finally shuts down
      await killAppPromise
      expect(isAppRunning(app)).toBe(false)
      expect(killAppResolved).toBe(true)
    })

    it('should not accept new requests during shutdown cleanup', async () => {
      const resPromise = fetchViaHTTP(appPort, '/api/long-running')
      const killAppPromise = killApp(app, LONG_RUNNING_MS * 2)
      expect(isAppRunning(app)).toBe(true)

      // Long running response should still be running after a bit
      await waitFor(LONG_RUNNING_MS / 2)
      expect(isAppRunning(app)).toBe(true)

      // Second request should be rejected
      await expect(fetchViaHTTP(appPort, '/api/long-running')).rejects.toThrow()

      // Original request responds as expected without being interrupted
      await expect(resPromise).resolves.toBeTruthy()
      const res = await resPromise
      expect(res?.status).toBe(200)
      expect(await res?.json()).toStrictEqual({ hello: 'world' })

      // App is still running briefly after response returns
      expect(isAppRunning(app)).toBe(true)

      // App finally shuts down
      await killAppPromise
      expect(isAppRunning(app)).toBe(false)
    })
  }
}

describe('API routes', () => {
  describe('dev support', () => {
    beforeEach(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterEach(() => killApp(app))

    runTests(true)
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
    })
    beforeEach(async () => {
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterEach(() => killApp(app))

    runTests()
  })
})
