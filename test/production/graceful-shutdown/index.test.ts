import { join } from 'path'
import { NextInstance, createNext, FileRef } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  retry,
  waitFor,
} from 'next-test-utils'
import fs from 'fs-extra'
import glob from 'glob'
import { LONG_RUNNING_MS } from './src/pages/api/long-running'
import { once } from 'events'

const appDir = join(__dirname, './src')
let appPort
let app: Awaited<ReturnType<typeof launchApp>>

function assertDefined<T>(value: T | void): asserts value is T {
  expect(value).toBeDefined()
}

describe('Graceful Shutdown', () => {
  describe('development (next dev)', () => {
    beforeEach(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterEach(() => killApp(app))

    runTests(true)
  })
  ;(process.env.IS_TURBOPACK_TEST && !process.env.TURBOPACK_BUILD
    ? describe.skip
    : describe)('production (next start)', () => {
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
  ;(process.env.IS_TURBOPACK_TEST && !process.env.TURBOPACK_BUILD
    ? describe.skip
    : describe)('production (standalone mode)', () => {
    let next: NextInstance
    let serverFile

    const projectFiles = {
      'next.config.mjs': `export default { output: 'standalone' }`,
    }

    for (const file of glob.sync('*', { cwd: appDir, dot: false })) {
      projectFiles[file] = new FileRef(join(appDir, file))
    }

    beforeAll(async () => {
      next = await createNext({
        files: projectFiles,
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
        /✓ Ready in \d+m?s/,
        {
          ...process.env,
          NEXT_EXIT_TIMEOUT_MS: '10',
          PORT: appPort.toString(),
        },
        undefined,
        { cwd: next.testDir }
      )
    })
    afterEach(() => killApp(app))

    afterAll(() => next.destroy())

    runTests()
  })
})

function runTests(dev = false) {
  if (dev) {
    it('should shut down child immediately', async () => {
      const appKilledPromise = once(app, 'exit')

      // let the dev server compile the route before running the test
      await expect(
        fetchViaHTTP(appPort, '/api/long-running')
      ).resolves.toBeDefined()

      const resPromise = fetchViaHTTP(appPort, '/api/long-running')

      // yield event loop to kick off request before killing the app
      await waitFor(20)
      process.kill(app.pid, 'SIGTERM')
      expect(app.exitCode).toBe(null)

      // `next dev` should kill the child immediately
      let start = Date.now()
      await expect(resPromise).rejects.toThrow()
      expect(Date.now() - start).toBeLessThan(LONG_RUNNING_MS)

      // `next dev` parent process is still running cleanup
      expect(app.exitCode).toBe(null)

      // App finally shuts down
      expect(await appKilledPromise).toEqual([0, null])
      expect(app.exitCode).toBe(0)
    })
  } else {
    // TODO: investigate this is constantly failing
    it.skip('should wait for requests to complete before exiting', async () => {
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
      expect(app.exitCode).toBe(null)

      // Long running response should still be running after a bit
      await waitFor(LONG_RUNNING_MS / 2)
      expect(app.exitCode).toBe(null)
      expect(responseResolved).toBe(false)

      // App responds as expected without being interrupted
      const res = await resPromise
      assertDefined(res)
      expect(res.status).toBe(200)
      expect(await res.json()).toStrictEqual({ hello: 'world' })

      // App is still running briefly after response returns
      expect(app.exitCode).toBe(null)
      expect(responseResolved).toBe(true)

      // App finally shuts down
      expect(await appKilledPromise).toEqual([0, null])
      expect(app.exitCode).toBe(0)
    })

    describe('should not accept new requests during shutdown cleanup', () => {
      it('should finish pending requests but refuse new ones', async () => {
        const appKilledPromise = once(app, 'exit')

        const resPromise = fetchViaHTTP(appPort, '/api/long-running')

        // yield event loop to kick off request before killing the app
        await waitFor(20)
        process.kill(app.pid, 'SIGTERM')
        expect(app.exitCode).toBe(null)

        // The app should start rejecting new connections soon
        await waitForAppToStartRefusingConnections(
          () => fetchViaHTTP(appPort, '/api/fast'),
          1000
        )

        // Original request responds as expected without being interrupted
        await expect(resPromise).resolves.toBeDefined()
        const res = await resPromise
        expect(res.status).toBe(200)
        expect(await res.json()).toStrictEqual({ hello: 'world' })

        // App finally shuts down
        expect(await appKilledPromise).toEqual([0, null])
        expect(app.exitCode).toBe(0)
      })

      it('should stop accepting new requests when shutting down', async () => {
        const appKilledPromise = once(app, 'exit')

        process.kill(app.pid, 'SIGTERM')
        expect(app.exitCode).toBe(null)

        // The app should start rejecting connections soon
        await waitForAppToStartRefusingConnections(
          () => fetchViaHTTP(appPort, '/api/fast'),
          1000
        )

        // App finally shuts down
        expect(await appKilledPromise).toEqual([0, null])
        expect(app.exitCode).toBe(0)
      })
    })
  }
}

async function waitForAppToStartRefusingConnections(
  sendRequest: () => Promise<import('node-fetch').Response>,
  maxDuration: number
) {
  // shutdown is async and can take a moment, so this is retried
  await retry(
    async () => {
      await expect(sendRequest).rejects.toEqual(
        expect.objectContaining({
          code: 'ECONNREFUSED',
        })
      )
    },
    maxDuration,
    100,
    'wait for app to start rejecting connections'
  )
}
