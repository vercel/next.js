/**
 * Unit tests for HMR side-effect auto-cleanup mechanism.
 * Uses Node.js built-in test runner (node:test).
 *
 * Run: node --test <this-file>
 *
 * @see https://github.com/vercel/next.js/issues/69098
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// === Simulate the tracking mechanism from dev-base.ts ===

const moduleTimers = new Map()
let trackingModuleId = null
const _origSetInterval = globalThis.setInterval
const _origSetTimeout = globalThis.setTimeout
const _origClearInterval = globalThis.clearInterval
const _origClearTimeout = globalThis.clearTimeout

function startTrackingSideEffects(moduleId) {
  trackingModuleId = moduleId
  moduleTimers.set(moduleId, new Set())

  globalThis.setInterval = (cb, ms, ...args) => {
    const h = _origSetInterval(cb, ms, ...args)
    moduleTimers.get(trackingModuleId)?.add(h)
    return h
  }
  globalThis.setTimeout = (cb, ms, ...args) => {
    const h = _origSetTimeout(cb, ms, ...args)
    moduleTimers.get(trackingModuleId)?.add(h)
    return h
  }
}

function stopTrackingSideEffects() {
  trackingModuleId = null
  globalThis.setInterval = _origSetInterval
  globalThis.setTimeout = _origSetTimeout
}

function cleanupTrackedSideEffects(moduleId) {
  const timers = moduleTimers.get(moduleId)
  if (timers) {
    for (const h of timers) {
      _origClearInterval(h)
      _origClearTimeout(h)
    }
    moduleTimers.delete(moduleId)
  }
}

// Helper: wait ms
const wait = (ms) => new Promise(r => _origSetTimeout(r, ms))

// === Tests ===

describe('HMR side-effect auto-cleanup', () => {
  afterEach(() => {
    globalThis.setInterval = _origSetInterval
    globalThis.setTimeout = _origSetTimeout
    for (const [id] of moduleTimers) {
      cleanupTrackedSideEffects(id)
    }
  })

  it('tracks setInterval created during module evaluation', () => {
    startTrackingSideEffects('module-a')
    const handle = setInterval(() => {}, 1000)
    stopTrackingSideEffects()

    const tracked = moduleTimers.get('module-a')
    assert.ok(tracked, 'tracked set should exist')
    assert.equal(tracked.size, 1)
    assert.ok(tracked.has(handle))

    cleanupTrackedSideEffects('module-a')
  })

  it('tracks setTimeout created during module evaluation', () => {
    startTrackingSideEffects('module-b')
    const handle = setTimeout(() => {}, 5000)
    stopTrackingSideEffects()

    const tracked = moduleTimers.get('module-b')
    assert.ok(tracked)
    assert.equal(tracked.size, 1)
    assert.ok(tracked.has(handle))

    cleanupTrackedSideEffects('module-b')
  })

  it('tracks multiple timers per module', () => {
    startTrackingSideEffects('module-c')
    setInterval(() => {}, 1000)
    setInterval(() => {}, 2000)
    setTimeout(() => {}, 3000)
    stopTrackingSideEffects()

    assert.equal(moduleTimers.get('module-c').size, 3)
    cleanupTrackedSideEffects('module-c')
  })

  it('does NOT track timers created AFTER stopTracking', () => {
    startTrackingSideEffects('module-d')
    setInterval(() => {}, 1000)
    stopTrackingSideEffects()

    // Created after stop — should NOT be tracked
    const laterHandle = setInterval(() => {}, 1000)
    assert.equal(moduleTimers.get('module-d').size, 1)
    assert.ok(!moduleTimers.get('module-d').has(laterHandle))

    clearInterval(laterHandle)
    cleanupTrackedSideEffects('module-d')
  })

  it('restores original setInterval/setTimeout after stop', () => {
    startTrackingSideEffects('module-e')
    assert.notEqual(globalThis.setInterval, _origSetInterval, 'should be patched during tracking')
    assert.notEqual(globalThis.setTimeout, _origSetTimeout, 'should be patched during tracking')

    stopTrackingSideEffects()
    assert.equal(globalThis.setInterval, _origSetInterval, 'should be restored')
    assert.equal(globalThis.setTimeout, _origSetTimeout, 'should be restored')

    cleanupTrackedSideEffects('module-e')
  })

  it('cleanupTrackedSideEffects actually clears running intervals', async () => {
    let callCount = 0

    startTrackingSideEffects('module-f')
    setInterval(() => { callCount++ }, 30)
    setInterval(() => { callCount++ }, 30)
    stopTrackingSideEffects()

    // Let intervals fire
    await wait(150)
    const countBefore = callCount
    assert.ok(countBefore > 0, `intervals should have fired, got ${countBefore}`)

    // Cleanup
    cleanupTrackedSideEffects('module-f')

    // Wait and verify no more increments
    await wait(150)
    assert.equal(callCount, countBefore, 'no more increments after cleanup')
  })

  it('cleanup is idempotent (double cleanup is safe)', () => {
    startTrackingSideEffects('module-g')
    setInterval(() => {}, 1000)
    stopTrackingSideEffects()

    cleanupTrackedSideEffects('module-g')
    assert.equal(moduleTimers.has('module-g'), false)

    // Second cleanup should not throw
    assert.doesNotThrow(() => cleanupTrackedSideEffects('module-g'))
  })

  it('tracks timers per module independently', () => {
    startTrackingSideEffects('mod-x')
    setInterval(() => {}, 1000)
    stopTrackingSideEffects()

    startTrackingSideEffects('mod-y')
    setInterval(() => {}, 1000)
    setInterval(() => {}, 2000)
    stopTrackingSideEffects()

    assert.equal(moduleTimers.get('mod-x').size, 1)
    assert.equal(moduleTimers.get('mod-y').size, 2)

    cleanupTrackedSideEffects('mod-x')
    assert.equal(moduleTimers.has('mod-x'), false)
    assert.equal(moduleTimers.get('mod-y').size, 2)

    cleanupTrackedSideEffects('mod-y')
  })

  it('simulates full HMR cycle: evaluate → dispose → re-evaluate', async () => {
    let v1CallCount = 0
    let v2CallCount = 0

    // === First evaluation (v1) ===
    startTrackingSideEffects('my-module')
    setInterval(() => { v1CallCount++ }, 30)
    stopTrackingSideEffects()

    await wait(120)
    assert.ok(v1CallCount > 0, 'v1 should have fired')

    // === Dispose (HMR) ===
    cleanupTrackedSideEffects('my-module')
    const v1CountAtDispose = v1CallCount

    // === Re-evaluate (v2) ===
    startTrackingSideEffects('my-module')
    setInterval(() => { v2CallCount++ }, 30)
    stopTrackingSideEffects()

    await wait(120)

    // v1 should NOT have incremented
    assert.equal(v1CallCount, v1CountAtDispose, 'v1 timers should be dead after dispose')
    // v2 SHOULD be running
    assert.ok(v2CallCount > 0, 'v2 should be running')

    cleanupTrackedSideEffects('my-module')
  })

  it('handles factory error (finally restores originals)', () => {
    startTrackingSideEffects('err-module')
    try {
      setInterval(() => {}, 1000) // tracked before error
      throw new Error('Module evaluation failed')
    } catch {
      // Expected
    } finally {
      stopTrackingSideEffects()
    }

    assert.equal(globalThis.setInterval, _origSetInterval, 'originals restored despite error')

    const tracked = moduleTimers.get('err-module')
    assert.equal(tracked.size, 1)
    cleanupTrackedSideEffects('err-module')
  })
})
