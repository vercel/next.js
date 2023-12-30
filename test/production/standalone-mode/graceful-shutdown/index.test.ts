import { NextInstance, createNext } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  isAppRunning,
  killApp,
  waitFor,
} from 'next-test-utils'
import glob from 'glob'
import { join } from 'path'
import fs from 'fs-extra'
import { once } from 'events'

import { LONG_RUNNING_MS } from './pages/api/long-running'

function assertDefined<T>(value: T | void): asserts value is T {
  expect(value).toBeDefined()
}

describe('standalone mode - graceful shutdown', () => {
  let next: NextInstance
  let appPort
  let serverFile
  let app

  beforeAll(async () => {
    next = await createNext({
      files: __dirname,
      dependencies: {
        swr: 'latest',
      },
    })

    await next.stop()

    await fs.move(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )

    for (const file of await fs.readdir(next.testDir)) {
      if (file !== 'standalone') {
        await fs.remove(join(next.testDir, file))
        console.log('removed', file)
      }
    }
    const files = glob.sync('**/*', {
      cwd: join(next.testDir, 'standalone/.next/server/pages'),
      dot: true,
    })

    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.html')) {
        await fs.remove(join(next.testDir, '.next/server', file))
      }
    }

    serverFile = join(next.testDir, 'standalone/server.js')
  })

  beforeEach(async () => {
    appPort = await findPort()
    app = await initNextServerScript(
      serverFile,
      /- Local:/,
      { ...process.env, PORT: appPort.toString() },
      undefined,
      { cwd: next.testDir }
    )
  })
  afterEach(() => killApp(app))

  afterAll(() => next.destroy())

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
    assertDefined(res)
    expect(res.status).toBe(200)
    expect(await res.json()).toStrictEqual({ hello: 'world' })

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
      await expect(fetchViaHTTP(appPort, '/api/long-running')).rejects.toThrow()

      // Original request responds as expected without being interrupted
      await expect(resPromise).resolves.toBeDefined()
      const res = await resPromise
      expect(res.status).toBe(200)
      expect(await res.json()).toStrictEqual({ hello: 'world' })

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

      // yield event loop to allow server to start the shutdown process
      await waitFor(20)
      await expect(fetchViaHTTP(appPort, '/api/long-running')).rejects.toThrow()

      // App finally shuts down
      await appKilledPromise
      expect(isAppRunning(app)).toBe(false)
    })
  })
})
