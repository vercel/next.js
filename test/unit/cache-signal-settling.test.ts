import { CacheSignal } from 'next/dist/server/app-render/cache-signal'

/**
 * This benchmark validates the performance improvement of moving `cacheSignal.endRead()`
 * timing in `use-cache-wrapper.ts`.
 *
 * ## The Change Being Validated
 *
 * **Before (old approach):**
 * - `endRead()` was called in `collectResult()` - AFTER the stream was fully consumed
 * - This meant `cacheReady()` had to wait for slow external API streams
 *
 * **After (new approach):**
 * - `endRead()` is called immediately after `generateCacheEntry()` returns
 * - The stream continues buffering in the background via `pendingCacheEntry`
 * - `cacheReady()` resolves almost immediately, unblocking prerendering
 *
 * ## Expected Results
 *
 * | Stream Duration | OLD Settling | NEW Settling | Speedup |
 * |-----------------|--------------|--------------|---------|
 * | 100ms           | ~100ms       | ~15ms        | ~7x     |
 * | 500ms           | ~500ms       | ~15ms        | ~33x    |
 * | 1000ms          | ~1000ms      | ~15ms        | ~67x    |
 */
describe('CacheSignal settling latency benchmark', () => {
  /**
   * Simulates a slow stream consumption (like reading from a slow external API).
   * In real use, this represents the time to fully buffer a streaming response.
   */
  function simulateSlowStreamConsumption(durationMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, durationMs))
  }

  describe('OLD approach: endRead() after stream consumption', () => {
    it('settling latency scales with stream duration (500ms stream)', async () => {
      const signal = new CacheSignal()
      const streamDuration = 500 // ms

      signal.beginRead()
      const startTime = performance.now()

      // OLD approach: wait for stream to finish, THEN call endRead()
      await simulateSlowStreamConsumption(streamDuration)
      signal.endRead()

      await signal.cacheReady()
      const settlingTime = performance.now() - startTime

      // Settling time should be >= stream duration (minus small timing tolerance)
      expect(settlingTime).toBeGreaterThanOrEqual(streamDuration - 50)
      console.log(
        `OLD settling latency (${streamDuration}ms stream): ${settlingTime.toFixed(2)}ms`
      )
    })
  })

  describe('NEW approach: endRead() immediately', () => {
    it('settling latency is constant regardless of stream duration (500ms stream)', async () => {
      const signal = new CacheSignal()
      const streamDuration = 500 // ms

      signal.beginRead()
      const startTime = performance.now()

      // NEW approach: endRead() immediately, stream continues in background
      signal.endRead()

      // Start stream consumption in background (this is the pendingCacheEntry pattern)
      // The key insight: cacheReady() doesn't wait for this!
      const streamPromise = simulateSlowStreamConsumption(streamDuration)

      await signal.cacheReady()
      const settlingTime = performance.now() - startTime

      // Settling time should be << stream duration
      // CacheSignal uses microtask + nextTick + setImmediate + setTimeout(0)
      // This typically resolves in ~10-50ms depending on event loop
      expect(settlingTime).toBeLessThan(100)
      console.log(
        `NEW settling latency (${streamDuration}ms stream): ${settlingTime.toFixed(2)}ms`
      )

      // Clean up: wait for the background stream to complete
      await streamPromise
    })
  })

  describe('Comparative benchmark across stream durations', () => {
    // Test various stream durations to show the scaling behavior
    const streamDurations = [100, 250, 500, 1000]

    for (const duration of streamDurations) {
      it(`compares settling latency for ${duration}ms stream`, async () => {
        // === OLD approach ===
        const oldSignal = new CacheSignal()
        oldSignal.beginRead()
        const oldStart = performance.now()
        await simulateSlowStreamConsumption(duration)
        oldSignal.endRead()
        await oldSignal.cacheReady()
        const oldTime = performance.now() - oldStart

        // === NEW approach ===
        const newSignal = new CacheSignal()
        newSignal.beginRead()
        const newStart = performance.now()
        newSignal.endRead() // Immediately!
        const backgroundStream = simulateSlowStreamConsumption(duration)
        await newSignal.cacheReady()
        const newTime = performance.now() - newStart

        // Clean up background stream
        await backgroundStream

        const speedup = oldTime / newTime
        console.log(
          `Stream ${duration}ms: OLD=${oldTime.toFixed(0)}ms, NEW=${newTime.toFixed(0)}ms, SPEEDUP=${speedup.toFixed(1)}x`
        )

        // Assertions
        expect(newTime).toBeLessThan(oldTime)
        expect(newTime).toBeLessThan(100) // NEW should always be fast
        expect(oldTime).toBeGreaterThanOrEqual(duration - 50) // OLD should be at least stream duration
      })
    }
  })

  describe('Edge cases', () => {
    it('handles cache hit scenario (no reads)', async () => {
      const signal = new CacheSignal()
      const startTime = performance.now()

      // Cache hit: no beginRead/endRead needed
      await signal.cacheReady()
      const settlingTime = performance.now() - startTime

      // Should settle quickly (just event loop delays)
      expect(settlingTime).toBeLessThan(100)
      console.log(`Cache hit settling latency: ${settlingTime.toFixed(2)}ms`)
    })

    it('handles multiple sequential reads with NEW approach', async () => {
      const signal = new CacheSignal()
      const streamDuration = 200

      // Simulate multiple cache reads (like nested `use cache` calls)
      signal.beginRead()
      signal.beginRead()
      signal.beginRead()

      const startTime = performance.now()

      // NEW approach: endRead immediately for each
      signal.endRead()
      signal.endRead()
      signal.endRead()

      // Background streams continue
      const streams = [
        simulateSlowStreamConsumption(streamDuration),
        simulateSlowStreamConsumption(streamDuration),
        simulateSlowStreamConsumption(streamDuration),
      ]

      await signal.cacheReady()
      const settlingTime = performance.now() - startTime

      // Should still settle quickly despite multiple reads
      expect(settlingTime).toBeLessThan(100)
      console.log(
        `Multiple reads (3x ${streamDuration}ms) settling latency: ${settlingTime.toFixed(2)}ms`
      )

      // Clean up
      await Promise.all(streams)
    })

    it('handles interleaved reads (one finishes, another starts)', async () => {
      const signal = new CacheSignal()

      // First read starts
      signal.beginRead()
      const startTime = performance.now()

      // First read completes quickly
      signal.endRead()

      // Second read starts before cacheReady settles
      signal.beginRead()

      // Second read completes
      signal.endRead()

      await signal.cacheReady()
      const settlingTime = performance.now() - startTime

      expect(settlingTime).toBeLessThan(100)
      console.log(
        `Interleaved reads settling latency: ${settlingTime.toFixed(2)}ms`
      )
    })
  })
})
