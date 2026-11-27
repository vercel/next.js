// Unit tests should test a specific utility without a browser or running
// `next`. Import the code under test from the compiled output, e.g.
// import { htmlEscapeJsonString } from 'next/dist/shared/lib/htmlescape'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Worker, WorkerExitError, WorkerPool } from 'next/dist/lib/worker'

/**
 * Real child processes whose worker module exits before sending READY. A
 * worker that never became ready has no requests assigned, so the pool must
 * bound how often it replaces it and reject the calls waiting for it.
 */
describe('worker pool: workers exiting before they are ready', () => {
  let dir: string
  let spawnLog: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-boot-failure-'))
    spawnLog = path.join(dir, 'spawns.log')
    fs.writeFileSync(spawnLog, '')
    fs.writeFileSync(
      path.join(dir, 'exits.js'),
      `require('fs').appendFileSync(${JSON.stringify(spawnLog)}, process.pid + '\\n')
process.exit(3)
exports.work = () => 'unreachable'
`
    )
    // The first worker to load stays healthy; later ones exit while loading.
    fs.writeFileSync(
      path.join(dir, 'first-healthy.js'),
      `const fs = require('fs')
fs.appendFileSync(${JSON.stringify(spawnLog)}, process.pid + '\\n')
const count = fs.readFileSync(${JSON.stringify(spawnLog)}, 'utf8').trim().split('\\n').length
if (count > 1) process.exit(3)
exports.work = async (n) => {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return n * 2
}
`
    )
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const spawnedPids = () =>
    fs.readFileSync(spawnLog, 'utf8').trim().split('\n').filter(Boolean)

  const isAlive = (pid: string) => {
    try {
      process.kill(Number(pid), 0)
      return true
    } catch {
      return false
    }
  }

  it('rejects the queued call after a bounded number of respawns', async () => {
    const pool = new WorkerPool({
      workerPath: path.join(dir, 'exits.js'),
      maxWorkers: 1,
    })
    try {
      const error: unknown = await pool
        .dispatch('work', [])
        .catch((err: unknown) => err)
      if (!(error instanceof WorkerExitError)) {
        throw new Error(`Expected a WorkerExitError, got: ${String(error)}`)
      }
      expect(error.code).toBe(3)
      expect(spawnedPids()).toHaveLength(3)
      expect(pool.getWorkerCount()).toBe(0)
      expect(spawnedPids().filter(isAlive)).toEqual([])

      // A later call gets a fresh budget.
      await expect(pool.dispatch('work', [])).rejects.toBeInstanceOf(
        WorkerExitError
      )
      expect(spawnedPids()).toHaveLength(6)
    } finally {
      pool.shutdownNow()
    }
  })

  it.each([0, 2])(
    'lets Worker retry %i time(s) and then fail',
    async (maxRetries) => {
      const onRestart = jest.fn()
      const worker = new Worker(path.join(dir, 'exits.js'), {
        exposedMethods: ['work'],
        workerName: 'Test worker',
        maxWorkers: 1,
        maxRetries,
        onRestart,
      }) as Worker & { work: () => Promise<unknown> }
      try {
        const error: unknown = await worker.work().catch((err: unknown) => err)
        if (!(error instanceof WorkerExitError)) {
          throw new Error(`Expected a WorkerExitError, got: ${String(error)}`)
        }
        expect(error.message).toContain('Test worker')
        expect(onRestart).toHaveBeenCalledTimes(maxRetries)
        // Each attempt is bounded.
        expect(spawnedPids()).toHaveLength(3 * (maxRetries + 1))
        expect(spawnedPids().filter(isAlive)).toEqual([])
      } finally {
        worker.shutdownNow()
      }
    }
  )

  it('keeps queued calls for a healthy worker', async () => {
    const pool = new WorkerPool({
      workerPath: path.join(dir, 'first-healthy.js'),
      maxWorkers: 2,
      maxBootingWorkers: 1,
      concurrencyPerWorker: 1,
    })
    try {
      const results = await Promise.all(
        [1, 2, 3, 4].map((n) => pool.dispatch('work', [n]))
      )
      expect(results).toEqual([2, 4, 6, 8])
      // One healthy worker plus at most the respawn budget of failing ones.
      // (A failing one may still be booting when the last call finishes.)
      expect(spawnedPids().length).toBeLessThanOrEqual(1 + 3)
    } finally {
      await pool.shutdown()
    }
    expect(spawnedPids().filter(isAlive)).toEqual([])
  })
})
