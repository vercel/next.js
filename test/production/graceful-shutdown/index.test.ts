import { join } from 'path'
import type { ChildProcess } from 'child_process'
import { NextInstance, FileRef, nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  retry,
  waitFor,
} from 'next-test-utils'
import fs from 'fs-extra'
import glob from 'glob'
import { LONG_RUNNING_MS } from './src/pages/api/long-running'
import { once } from 'events'

const appDir = join(__dirname, './src')
let appPort: number
let app: ChildProcess
let currentExit: Promise<any> | undefined

function assertDefined<T>(value: T | void): asserts value is T {
  expect(value).toBeDefined()
}

async function launchChildServer(
  next: NextInstance,
  args: string[],
  readyPattern: RegExp = /- Local:|✓ Ready|Ready in/i
): Promise<{ child: ChildProcess; exit: Promise<any> }> {
  let child!: ChildProcess
  let resolveReady!: () => void
  let ready = false
  const readyPromise = new Promise<void>((r) => {
    resolveReady = () => {
      if (!ready) {
        ready = true
        r()
      }
    }
  })

  const exit = next
    .runCommand(args, {
      onStdout: (msg) => {
        if (readyPattern.test(msg)) resolveReady()
      },
      onStderr: (msg) => {
        if (readyPattern.test(msg)) resolveReady()
      },
      instance: (p) => {
        child = p
      },
    })
    .finally(() => {
      resolveReady()
    })

  await readyPromise
  return { child, exit }
}

describe('Graceful Shutdown', () => {
  describe('development (next dev)', () => {
    const { next } = nextTestSetup({
      files: appDir,
      skipStart: true,
    })

    beforeEach(async () => {
      appPort = await findPort()
      const { child, exit } = await launchChildServer(next, [
        'dev',
        '-p',
        String(appPort),
      ])
      app = child
      currentExit = exit
    })
    afterEach(async () => {
      try {
        await killApp(app)
      } catch {}
      await currentExit?.catch(() => {})
    })

    runTests(true)
  })
  ;(process.env.IS_TURBOPACK_TEST && !process.env.TURBOPACK_BUILD
    ? describe.skip
    : describe)('production (next start)', () => {
    const { next } = nextTestSetup({
      files: appDir,
      skipStart: true,
    })

    beforeAll(async () => {
      await next.build()
    })
    beforeEach(async () => {
      appPort = await findPort()
      const { child, exit } = await launchChildServer(next, [
        'start',
        '-p',
        String(appPort),
      ])
      app = child
      currentExit = exit
    })
    afterEach(async () => {
      try {
        await killApp(app)
      } catch {}
      await currentExit?.catch(() => {})
    })

    runTests()
  })
  ;(process.env.IS_TURBOPACK_TEST && !process.env.TURBOPACK_BUILD
    ? describe.skip
    : describe)('production (standalone mode)', () => {
    const projectFiles: Record<string, string | FileRef> = {
      'next.config.mjs': `export default { output: 'standalone' }`,
    }

    for (const file of glob.sync('*', { cwd: appDir, dot: false })) {
      projectFiles[file] = new FileRef(join(appDir, file))
    }

    const { next } = nextTestSetup({
      files: projectFiles,
      dependencies: {
        swr: 'latest',
      },
      skipStart: true,
    })

    let serverFile: string

    beforeAll(async () => {
      const { exitCode } = await next.build()
      if (exitCode !== 0) {
        throw new Error(`Failed to build next: ${exitCode}`)
      }

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
        /✓ Ready in/,
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

    runTests()
  })
})

function runTests(dev = false) {
  if (dev) {
    it('should shut down child immediately', async () => {
      const appKilledPromise = once(app, 'exit')

      await expect(
        fetchViaHTTP(appPort, '/api/long-running')
      ).resolves.toBeDefined()

      const resPromise = fetchViaHTTP(appPort, '/api/long-running')

      await waitFor(20)
      process.kill(app.pid!, 'SIGTERM')
      expect(app.exitCode).toBe(null)

      let start = Date.now()
      await expect(resPromise).rejects.toThrow()
      expect(Date.now() - start).toBeLessThan(LONG_RUNNING_MS)

      expect(app.exitCode).toBe(null)

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

      await waitFor(20)
      process.kill(app.pid!, 'SIGTERM')
      expect(app.exitCode).toBe(null)

      await waitFor(LONG_RUNNING_MS / 2)
      expect(app.exitCode).toBe(null)
      expect(responseResolved).toBe(false)

      const res = await resPromise
      assertDefined(res)
      expect(res.status).toBe(200)
      expect(await res.json()).toStrictEqual({ hello: 'world' })

      expect(app.exitCode).toBe(null)
      expect(responseResolved).toBe(true)

      expect(await appKilledPromise).toEqual([0, null])
      expect(app.exitCode).toBe(0)
    })

    describe('should not accept new requests during shutdown cleanup', () => {
      it('should finish pending requests but refuse new ones', async () => {
        const appKilledPromise = once(app, 'exit')

        const resPromise = fetchViaHTTP(appPort, '/api/long-running')

        await waitFor(20)
        process.kill(app.pid!, 'SIGTERM')
        expect(app.exitCode).toBe(null)

        await waitForAppToStartRefusingConnections(
          () => fetchViaHTTP(appPort, '/api/fast'),
          1000
        )

        await expect(resPromise).resolves.toBeDefined()
        const res = await resPromise
        expect(res.status).toBe(200)
        expect(await res.json()).toStrictEqual({ hello: 'world' })

        expect(await appKilledPromise).toEqual([143, null])
        expect(app.exitCode).toBe(143)
      })

      it('should stop accepting new requests when shutting down', async () => {
        const appKilledPromise = once(app, 'exit')

        // Warm-up request to ensure the server has fully booted and registered
        // its SIGTERM handler before we send the signal. Without this, CI runs
        // can occasionally race and exit via the default signal disposition
        // (signal=SIGTERM, code=null) instead of the graceful exit (code=143).
        await fetchViaHTTP(appPort, '/api/fast').catch(() => {})

        process.kill(app.pid!, 'SIGTERM')
        expect(app.exitCode).toBe(null)

        await waitForAppToStartRefusingConnections(
          () => fetchViaHTTP(appPort, '/api/fast'),
          1000
        )

        expect(await appKilledPromise).toEqual([143, null])
        expect(app.exitCode).toBe(143)
      })
    })
  }
}

async function waitForAppToStartRefusingConnections(
  sendRequest: () => Promise<import('node-fetch').Response>,
  maxDuration: number
) {
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
