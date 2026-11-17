import { spawn } from 'child_process'
import { once } from 'events'
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import path from 'path'
import treeKill from 'tree-kill'
import { retry } from 'next-test-utils'
import { useTempDir } from '../lib/use-temp-dir'

const fixtures = path.join(__dirname, 'telemetry-detached-flush')
const flushScript = require.resolve('next/dist/telemetry/detached-flush')
const storage = require.resolve('next/dist/telemetry/storage')
const eventsFile = '_events_test.json'

function createProject(dir: string, count = 1) {
  cpSync(fixtures, dir, { recursive: true })
  const distDir = path.join(dir, 'custom-output', 'dev')
  mkdirSync(path.join(distDir, 'cache'), { recursive: true })
  const events = Array.from({ length: count }, (_, i) => ({
    eventName: 'DETACHED_FLUSH_TEST',
    payload: { i, filler: 'x'.repeat(128) },
  }))
  return {
    distDir,
    events,
    eventsPath: path.join(distDir, 'cache', eventsFile),
  }
}

function runProcess(
  dir: string,
  args: string[],
  env: Partial<NodeJS.ProcessEnv> = {},
  pauseStderr = false
) {
  const child = spawn(process.execPath, args, {
    cwd: dir,
    env: {
      ...process.env,
      // Isolate telemetry settings in the fixture's output directory.
      CI: '1',
      NODE_ENV: 'development',
      NODE_OPTIONS: '',
      NEXT_TELEMETRY_DISABLED: '',
      NEXT_TELEMETRY_DEBUG: '1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (data) => (stdout += data))
  child.stderr.setEncoding('utf8').on('data', (data) => (stderr += data))
  if (pauseStderr) child.stderr.pause()

  const completed = new Promise<{ code: number | null; stderr: string }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        treeKill(child.pid!, 'SIGKILL')
        reject(
          new Error(`Telemetry process did not exit:\n${stdout}\n${stderr}`)
        )
      }, 15_000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        resolve({ code, stderr })
      })
    }
  )
  return { child, completed }
}

describe('telemetry detached-flush', () => {
  it('passes the batch directory without evaluating config', async () => {
    await useTempDir(async (dir) => {
      const { distDir } = createProject(dir)
      const { code, stderr } = await runProcess(dir, [
        path.join(dir, 'record.cjs'),
        storage,
        distDir,
      ]).completed

      expect(code).toBe(0)
      expect(stderr).toContain('DETACHED_FLUSH_TEST')
      expect(existsSync(path.join(dir, 'config-loaded'))).toBe(false)
      expect(readdirSync(path.join(distDir, 'cache'))).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^_events_/)])
      )
    })
  })

  it.each(['environment', 'persisted'])(
    'does not spawn or write a batch when disabled by %s, even in debug mode',
    async (setting) => {
      await useTempDir(async (dir) => {
        const { distDir } = createProject(dir)
        const { code, stderr } = await runProcess(
          dir,
          [path.join(dir, 'record.cjs'), storage, distDir, setting],
          setting === 'environment' ? { NEXT_TELEMETRY_DISABLED: '1' } : {}
        ).completed

        expect(code).toBe(0)
        expect(stderr).not.toContain('DETACHED_FLUSH_TEST')
        expect(existsSync(path.join(dir, 'config-loaded'))).toBe(false)
        expect(readdirSync(path.join(distDir, 'cache'))).not.toEqual(
          expect.arrayContaining([expect.stringMatching(/^_events_/)])
        )
      })
    }
  )

  it('rejects a missing directory instead of falling back to config', async () => {
    await useTempDir(async (dir) => {
      createProject(dir)
      const { code, stderr } = await runProcess(dir, [
        flushScript,
        'dev',
        dir,
        eventsFile,
      ]).completed

      expect(code).toBe(1)
      expect(stderr).toContain('<distDir>')
      expect(existsSync(path.join(dir, 'config-loaded'))).toBe(false)
    })
  })

  it.each([false, true])(
    'drains debug output with a paused reader (blocking=%s)',
    async (blocking) => {
      await useTempDir(async (dir) => {
        const { distDir, events, eventsPath } = createProject(dir, 300)
        writeFileSync(eventsPath, JSON.stringify(events))
        const { child, completed } = runProcess(
          dir,
          [
            ...(blocking ? ['-r', path.join(dir, 'blocking-stderr.cjs')] : []),
            flushScript,
            'dev',
            dir,
            eventsFile,
            distDir,
          ],
          {},
          true
        )

        try {
          if (process.platform === 'win32' || blocking) {
            // Synchronous pipe writes can block before file cleanup.
            await once(child.stderr, 'readable')
          } else {
            // Keep asynchronous writes backpressured through completion so an
            // explicit process.exit() would truncate the queued debug output.
            await retry(async () => {
              expect(existsSync(eventsPath)).toBe(false)
            })
          }
        } finally {
          child.stderr.resume()
        }
        const { code, stderr } = await completed
        expect(code).toBe(0)
        expect(stderr.match(/\[telemetry\]/g)).toHaveLength(events.length)
        expect(existsSync(eventsPath)).toBe(false)
        expect(existsSync(path.join(dir, 'config-loaded'))).toBe(false)
      })
    }
  )

  it.each(['', '1'])(
    'terminates at ten minutes with an open handle (debug=%j)',
    async (debug) => {
      await useTempDir(async (dir) => {
        const { distDir, events, eventsPath } = createProject(dir)
        writeFileSync(eventsPath, JSON.stringify(events))
        const { code, stderr } = await runProcess(
          dir,
          [
            '-r',
            path.join(dir, 'deadline.cjs'),
            flushScript,
            'dev',
            dir,
            eventsFile,
            distDir,
          ],
          { NEXT_TELEMETRY_DEBUG: debug, NEXT_TELEMETRY_DISABLED: '1' }
        ).completed

        expect(code).toBe(0)
        expect(stderr).toContain('Ten-minute deadline reached')
        expect(existsSync(eventsPath)).toBe(false)
      })
    }
  )
})
