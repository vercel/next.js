/**
 * Benchmark Utilities for Performance Regression Testing
 */

const config = require('./benchmark.config')

export interface BenchmarkResult {
  name: string
  duration: number // in milliseconds
  iterations: number
  avgDuration: number
  minDuration: number
  maxDuration: number
  passed: boolean
  exceeded: boolean
  warning: boolean
}

export interface BenchmarkOptions {
  iterations?: number
  warmupIterations?: number
  name?: string
}

/**
 * Run a benchmark for a given function
 */
export function benchmark(
  fn: () => void,
  options: BenchmarkOptions = {}
): BenchmarkResult {
  const {
    iterations = config.iterations.default,
    warmupIterations = Math.min(100, Math.floor(iterations * 0.1)),
    name = 'benchmark',
  } = options

  // Warmup phase
  for (let i = 0; i < warmupIterations; i++) {
    fn()
  }

  // Actual benchmark
  const durations: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    const end = performance.now()
    durations.push(end - start)
  }

  const totalDuration = durations.reduce((sum, d) => sum + d, 0)
  const avgDuration = totalDuration / iterations
  const minDuration = Math.min(...durations)
  const maxDuration = Math.max(...durations)

  const threshold = config.thresholds[name]
  const passed = threshold ? avgDuration < threshold.max : true
  const exceeded = threshold ? avgDuration > threshold.max : false
  const warning = threshold
    ? avgDuration > threshold.warn && avgDuration < threshold.max
    : false

  return {
    name,
    duration: totalDuration,
    iterations,
    avgDuration,
    minDuration,
    maxDuration,
    passed,
    exceeded,
    warning,
  }
}

/**
 * Run an async benchmark for a given function
 */
export async function benchmarkAsync(
  fn: () => Promise<void>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const {
    iterations = config.iterations.default,
    warmupIterations = Math.min(100, Math.floor(iterations * 0.1)),
    name = 'benchmark',
  } = options

  // Warmup phase
  for (let i = 0; i < warmupIterations; i++) {
    await fn()
  }

  // Actual benchmark
  const durations: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    const end = performance.now()
    durations.push(end - start)
  }

  const totalDuration = durations.reduce((sum, d) => sum + d, 0)
  const avgDuration = totalDuration / iterations
  const minDuration = Math.min(...durations)
  const maxDuration = Math.max(...durations)

  const threshold = config.thresholds[name]
  const passed = threshold ? avgDuration < threshold.max : true
  const exceeded = threshold ? avgDuration > threshold.max : false
  const warning = threshold
    ? avgDuration > threshold.warn && avgDuration < threshold.max
    : false

  return {
    name,
    duration: totalDuration,
    iterations,
    avgDuration,
    minDuration,
    maxDuration,
    passed,
    exceeded,
    warning,
  }
}

/**
 * Format benchmark results for display
 */
export function formatBenchmarkResult(result: BenchmarkResult): string {
  const status = result.exceeded
    ? '❌ FAILED'
    : result.warning
      ? '⚠️  WARNING'
      : '✅ PASSED'

  return `
${status} ${result.name}
  Iterations: ${result.iterations}
  Total Duration: ${result.duration.toFixed(2)}ms
  Average: ${result.avgDuration.toFixed(4)}ms
  Min: ${result.minDuration.toFixed(4)}ms
  Max: ${result.maxDuration.toFixed(4)}ms
  `
}

/**
 * Compare two benchmark results
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  current: BenchmarkResult
): {
  improvement: number
  regression: boolean
  percentChange: number
} {
  const percentChange =
    ((current.avgDuration - baseline.avgDuration) / baseline.avgDuration) * 100
  const improvement = baseline.avgDuration - current.avgDuration
  const regression = improvement < 0

  return {
    improvement,
    regression,
    percentChange,
  }
}

/**
 * Expect benchmark to pass threshold
 */
export function expectBenchmarkToPass(result: BenchmarkResult): void {
  if (result.exceeded) {
    throw new Error(
      `Benchmark "${result.name}" exceeded threshold: ${result.avgDuration.toFixed(4)}ms (max: ${config.thresholds[result.name]?.max}ms)`
    )
  }
}

/**
 * Measure memory usage during operation
 */
export function measureMemory<T>(fn: () => T): {
  result: T
  memoryUsed: number
} {
  if (typeof global.gc === 'function') {
    global.gc()
  }

  const before = process.memoryUsage().heapUsed

  const result = fn()

  const after = process.memoryUsage().heapUsed
  const memoryUsed = (after - before) / 1024 / 1024 // Convert to MB

  return { result, memoryUsed }
}
