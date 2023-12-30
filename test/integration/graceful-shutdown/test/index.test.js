/* eslint-env jest */

import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  isAppRunning,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import { LONG_RUNNING_MS } from '../pages/api/long-running'
import { once } from 'events'

const appDir = join(__dirname, '../')
let appPort
let app

function runTests(dev = false) {
  if (dev) {
    it('should shut down child immediately', async () => {
      const appKilledPromise = once(app, 'exit')

      // let the dev server compile the route before running the test
      await expect(
        fetchViaHTTP(appPort, '/api/long-running')
      ).resolves.toBeTruthy()

      const resPromise = fetchViaHTTP(appPort, '/api/long-running')

      // yield event loop to kick off request before killing the app
      await waitFor(20)
      process.kill(app.pid, 'SIGTERM')
      expect(isAppRunning(app)).toBe(true)

      // `next dev` should kill the child immediately
      let start = Date.now()
      await expect(resPromise).rejects.toThrow()
      expect(Date.now() - start).toBeLessThan(LONG_RUNNING_MS)

      // `next dev` parent process is still running cleanup
      expect(isAppRunning(app)).toBe(true)

      // App finally shuts down
      await appKilledPromise
      expect(isAppRunning(app)).toBe(false)
    })
  } else {
    it('should wait for requests to complete before exiting', async () => {
      const appKilledPromise = once(app, 'exit')

      let responseResolved = false
      const resPromise = fetchViaHTTP(appPort, '/api/long-running')
        .then((res) => {
          responseResolved = true
          return res
        })
        .catch(() => {})

      // yield event loop to kick off request before killing the app
      await waitFor(20)
      process.kill(app.pid, 'SIGTERM')
      expect(isAppRunning(app)).toBe(true)

      // Long running response should still be running after a bit
      await waitFor(LONG_RUNNING_MS / 2)
      expect(isAppRunning(app)).toBe(true)
      expect(responseResolved).toBe(false)

      // App responds as expected without being interrupted
      const res = await resPromise
      expect(res?.status).toBe(200)
      expect(await res?.json()).toStrictEqual({ hello: 'world' })

      // App is still running briefly after response returns
      expect(isAppRunning(app)).toBe(true)
      expect(responseResolved).toBe(true)

      // App finally shuts down
      await appKilledPromise
      expect(isAppRunning(app)).toBe(false)
    })

    describe('should not accept new requests during shutdown cleanup', () => {
      it('when request is made before shutdown', async () => {
        const appKilledPromise = once(app, 'exit')

        const resPromise = fetchViaHTTP(appPort, '/api/long-running')

        // yield event loop to kick off request before killing the app
        await waitFor(20)
        process.kill(app.pid, 'SIGTERM')
        expect(isAppRunning(app)).toBe(true)

        // Long running response should still be running after a bit
        await waitFor(LONG_RUNNING_MS / 2)
        expect(isAppRunning(app)).toBe(true)

        // Second request should be rejected
        await expect(
          fetchViaHTTP(appPort, '/api/long-running')
        ).rejects.toThrow()

        // Original request responds as expected without being interrupted
        await expect(resPromise).resolves.toBeTruthy()
        const res = await resPromise
        expect(res?.status).toBe(200)
        expect(await res?.json()).toStrictEqual({ hello: 'world' })

        // App is still running briefly after response returns
        expect(isAppRunning(app)).toBe(true)

        // App finally shuts down
        await appKilledPromise
        expect(isAppRunning(app)).toBe(false)
      })

      it('when there is no activity', async () => {
        const appKilledPromise = once(app, 'exit')

        process.kill(app.pid, 'SIGTERM')
        expect(isAppRunning(app)).toBe(true)

        await expect(
          fetchViaHTTP(appPort, '/api/long-running')
        ).rejects.toThrow()

        // App is still running briefly while server is closing
        expect(isAppRunning(app)).toBe(true)

        // App finally shuts down
        await appKilledPromise
        expect(isAppRunning(app)).toBe(false)
      })
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
