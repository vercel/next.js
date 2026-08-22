import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { useTempDir } from '../lib/use-temp-dir'

/**
 * `detached-flush` is spawned with `detached: true` and nothing supervises it,
 * so it has to terminate under every outcome or it is reparented to init and
 * leaks: one process per `next dev` shutdown, holding whatever its work left
 * behind.
 *
 * It used to discover `distDir` by calling `loadConfig()`, which evaluates the
 * user's `next.config` in the development-server phase. Config plugins
 * legitimately start file watchers and bundler services there, and those keep
 * the process alive forever. `distDir` is a required argument and no config
 * is evaluated here at all, with an unref'd watchdog bounding the one thing
 * left that can hang: an unbounded telemetry request.
 */
const FLUSH_SCRIPT = require.resolve('next/dist/telemetry/detached-flush')

const EVENTS_FILE = '_events_test.json'

const RUN_TIMEOUT_MS = 30_000

/** Past the child's 10s watchdog, so a watchdog exit would be observable. */
const SLOW_READER_MS = 12_000

/** Marker written by the fixture config, so a test can assert it never ran. */
const CONFIG_MARKER = 'config-was-evaluated'

/**
 * Fills a directory from `useTempDir` with the smallest project this script
 * accepts, and returns the dist dir the events file was written to.
 */
function createProject(
  dir: string,
  nextConfig: string | ((dir: string) => string)
): string {
  writeFileSync(
    path.join(dir, 'next.config.js'),
    typeof nextConfig === 'function' ? nextConfig(dir) : nextConfig
  )
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'detached-flush-fixture', version: '0.0.0' })
  )

  // The dev-phase distDir is `.next/dev`, not `.next`. Writing the events file
  // to `.next` makes `detached-flush` take its ENOENT branch, which returns on
  // its own, so the process would exit for the wrong reason and these tests
  // would pass against the unfixed code.
  const distDir = path.join(dir, '.next', 'dev')
  mkdirSync(distDir, { recursive: true })
  writeFileSync(
    path.join(distDir, EVENTS_FILE),
    JSON.stringify([{ eventName: 'testEvent', payload: {} }])
  )
  return distDir
}

/**
 * `runNextCommand` is not reusable here: it resolves and spawns `dist/bin/next`
 * specifically, and these cases invoke the flush script directly, one of them
 * with a `-r` preload.
 */
function runDetachedFlush(
  dir: string,
  distDir?: string,
  { preload }: { preload?: string } = {}
): Promise<{ code: number | null; timedOut: boolean; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = preload ? ['-r', preload] : []
    args.push(FLUSH_SCRIPT, 'dev', dir, EVENTS_FILE)
    if (distDir) args.push(distDir)

    const child = spawn(process.execPath, args, {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        // The leak is independent of the opt-out: nothing here consults it
        // before the work that used to hang.
        NEXT_TELEMETRY_DISABLED: '1',
      },
      // stderr is captured so a failing case can be asserted on its message
      // rather than only on a non-zero exit, which any crash would satisfy.
      // It is drained as it arrives: these cases write far less than a pipe
      // buffer, but an undrained pipe would deadlock the child if they grew.
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => (stderr += chunk))

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, RUN_TIMEOUT_MS)

    // Without this an infrastructure failure surfaces as a misattributed
    // timeout rather than the actual error.
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    // `close` rather than `exit`: it waits for stderr to reach EOF, so the
    // collected output is complete before it is asserted on.
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, timedOut, stderr })
    })
  })
}

describe('telemetry detached-flush', () => {
  it('should exit, and not evaluate next.config, when given distDir', async () => {
    await useTempDir(async (dir) => {
      // The config writes a marker when evaluated, so its absence is proof the
      // child never ran it. The consumed events file is the control: it shows
      // the child ran to completion, so the missing marker is not just an early
      // exit.
      const distDir = createProject(
        dir,
        (d) =>
          "require('fs').writeFileSync(" +
          JSON.stringify(path.join(d, CONFIG_MARKER)) +
          ", '')\nmodule.exports = {}\n"
      )

      const { code, timedOut } = await runDetachedFlush(dir, distDir)

      expect(timedOut).toBe(false)
      expect(code).toBe(0)
      // The whole point: the child does not run the user's config.
      expect(existsSync(path.join(dir, CONFIG_MARKER))).toBe(false)
      expect(existsSync(path.join(distDir, EVENTS_FILE))).toBe(false)
    })
  })

  it('should reject an invocation that omits distDir', async () => {
    await useTempDir(async (dir) => {
      // `distDir` is required so there is no argument shape that falls back to
      // evaluating the config. `Telemetry#flushDetached` is the only caller and
      // resolves this file from its own package, so parent and child are always
      // the same build and there is no older invocation to stay compatible
      // with.
      const distDir = createProject(dir, 'module.exports = {}\n')

      const { code, timedOut, stderr } = await runDetachedFlush(dir)

      expect(timedOut).toBe(false)
      // Node exits 1 on an unhandled rejection; pinned rather than
      // `not.toBe(0)` so a change to some other failure mode is visible.
      expect(code).toBe(1)
      // Asserted on the message, not just a non-zero exit: a missing module or
      // a syntax error would also exit non-zero, and this case exists to prove
      // the argument check is what rejected it.
      expect(stderr).toContain(
        'Invariant: detached-flush must be invoked as: node detached-flush dev <projectDir> <eventsFile> <distDir>'
      )
      // It failed before doing any work rather than silently flushing.
      expect(existsSync(path.join(distDir, EVENTS_FILE))).toBe(true)
    })
  })

  it('should exit when a pending handle would otherwise keep it alive', async () => {
    await useTempDir(async (dir) => {
      // Stands in for a telemetry request that never settles, the one thing
      // left that can hang this process, since `submitRecord` always passes its
      // own signal and the 5s `AbortSignal.timeout` fallback never applies.
      // Without the watchdog this is reparented to init and stays there.
      const distDir = createProject(dir, 'module.exports = {}\n')
      const preload = path.join(dir, 'hold-open.js')
      writeFileSync(preload, 'setInterval(() => {}, 1000)\n')

      const started = Date.now()
      const { code, timedOut } = await runDetachedFlush(dir, distDir, {
        preload,
      })

      expect(timedOut).toBe(false)
      expect(code).toBe(0)
      // The watchdog ended it, rather than the event loop emptying on its own.
      expect(Date.now() - started).toBeGreaterThan(5_000)
    })
  })

  it('should not truncate NEXT_TELEMETRY_DEBUG output when the reader is slow', async () => {
    await useTempDir(async (dir) => {
      // Enough records to exceed the OS pipe buffer, with nothing draining it
      // until after the watchdog window. `process.exit()`, whether at the end
      // of the flush, as before #85867, or from the watchdog, discards the
      // writes still queued behind that buffer.
      const N = 300
      const distDir = createProject(dir, 'module.exports = {}\n')
      writeFileSync(
        path.join(distDir, EVENTS_FILE),
        JSON.stringify(
          Array.from({ length: N }, (_, i) => ({
            eventName: 'testEvent',
            payload: { i, filler: 'x'.repeat(64) },
          }))
        )
      )

      const child = spawn(
        process.execPath,
        [FLUSH_SCRIPT, 'dev', dir, EVENTS_FILE, distDir],
        {
          env: {
            ...process.env,
            NODE_ENV: 'development',
            NEXT_TELEMETRY_DEBUG: '1',
            // Debug output is produced before the opt-out is consulted, so this
            // keeps the test off the network without affecting what it asserts.
            NEXT_TELEMETRY_DISABLED: '1',
          },
          stdio: ['ignore', 'ignore', 'pipe'],
        }
      )

      // `close` rather than `exit`: it waits for stdio to reach EOF. Awaited
      // at the end, but registered here: `close` fires once, so a listener
      // attached after the pause below would miss a child that ended during
      // it, and the test would hang to the Jest timeout instead of failing on
      // the record count.
      const closed = new Promise((resolve) => child.once('close', resolve))

      // No listener yet, so nothing is read and the child blocks on write. A
      // plain sleep rather than `waitFor` from `next-test-utils`: that module
      // pulls in express, node-fetch and the Next server, which is a lot of
      // weight for a unit test that only needs to wait.
      await new Promise((resolve) => setTimeout(resolve, SLOW_READER_MS))
      let out = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => (out += chunk))

      const code = await closed

      expect(code).toBe(0)
      expect((out.match(/\[telemetry\]/g) || []).length).toBe(N)
    })
  })
})
