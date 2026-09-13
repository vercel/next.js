import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import {
  fetchViaHTTP,
  findPort,
  killProcess,
  retry,
  shouldUseTurbopack,
} from 'next-test-utils'

// Drives the CLI directly rather than `nextTestSetup`, which keeps stdout
// drained for its own log assertions. This suite needs to close the read end.
//
// Regression test: an early-exiting stdout reader (`next dev | head -20`) used
// to leave the dev server pinning a CPU core in an `EPIPE` loop, accepting
// connections but never answering them.
//
// x-ref: https://github.com/vercel/next.js/issues/96216
describe('dev server with a broken stdout pipe', () => {
  let app: ChildProcess | undefined

  afterEach(async () => {
    if (app?.pid) {
      await killProcess(app.pid, 'SIGKILL').catch(() => {})
    }
    app = undefined
  })

  it('keeps serving requests after the stdout reader goes away', async () => {
    const port = await findPort()
    const nextBin = path.join(
      path.dirname(require.resolve('next/package')),
      'dist/bin/next'
    )

    const env = {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      __NEXT_TEST_MODE: 'true',
    }
    // Let Next.js pick the environment itself.
    delete env.NODE_ENV

    app = spawn(
      'node',
      [
        '--no-deprecation',
        nextBin,
        'dev',
        shouldUseTurbopack() ? '--turbopack' : '--webpack',
        '--port',
        String(port),
      ],
      { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] }
    )

    let output = ''
    app.stdout!.on('data', (chunk) => {
      output += chunk
    })
    app.stderr!.on('data', (chunk) => {
      output += chunk
    })

    await retry(
      async () => {
        expect(output).toMatch(/Ready in/)
      },
      120_000,
      1_000,
      'dev server to be ready'
    )

    // Sanity check: the server works while the pipe is still being read.
    expect((await fetchViaHTTP(port, '/')).status).toBe(200)

    // Simulate a reader such as `head -n` exiting.
    app.stdout!.destroy()
    app.stderr!.destroy()

    // Well past the point where the pipe buffer used to fill up. Without a
    // guard these requests never resolve.
    for (let i = 0; i < 25; i++) {
      const res = await fetchViaHTTP(port, '/', null, {
        signal: AbortSignal.timeout(15_000),
      })
      expect(res.status).toBe(200)
    }

    // The server should still be alive rather than having crashed on `EPIPE`.
    expect(app.exitCode).toBe(null)
  })
})
