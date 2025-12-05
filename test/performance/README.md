# Performance Regression Testing

This directory contains performance benchmarks and regression tests for critical Next.js operations.

## Overview

Performance regression testing helps ensure that code changes don't introduce performance degradations. The benchmarks measure execution time, memory usage, and other performance metrics for critical paths.

## Running Benchmarks

### Run all benchmark tests

```bash
pnpm test test/performance/**/*.bench.test.ts
```

### Run specific benchmark

```bash
pnpm test test/performance/router.bench.test.ts
pnpm test test/performance/utilities.bench.test.ts
```

### Run with coverage

```bash
COVERAGE=true pnpm test test/performance/**/*.bench.test.ts
```

## Benchmark Configuration

Performance thresholds are configured in `benchmark.config.js`. The configuration includes:

- **Operation Thresholds**: Maximum execution time (in ms) for specific operations
- **Iteration Counts**: Number of times each benchmark runs
- **Bundle Size Limits**: Maximum allowed bundle sizes
- **Memory Limits**: Maximum memory usage for build processes

### Example Configuration

```javascript
thresholds: {
  'route-matching': {
    max: 1,    // Maximum 1ms per operation
    warn: 0.5  // Warn if over 0.5ms
  }
}
```

## Benchmark Utilities

The `benchmark-utils.ts` file provides utilities for writing benchmarks:

### `benchmark(fn, options)`

Runs a synchronous benchmark:

```typescript
import { benchmark, expectBenchmarkToPass } from './benchmark-utils'

const result = benchmark(
  () => {
    // Code to benchmark
    myFunction()
  },
  {
    iterations: 10000,
    name: 'my-operation',
  }
)

expectBenchmarkToPass(result)
```

### `benchmarkAsync(fn, options)`

Runs an asynchronous benchmark:

```typescript
const result = await benchmarkAsync(
  async () => {
    await myAsyncFunction()
  },
  {
    iterations: 1000,
    name: 'my-async-operation',
  }
)
```

### `measureMemory(fn)`

Measures memory usage during an operation:

```typescript
const { result, memoryUsed } = measureMemory(() => {
  // Memory-intensive operation
  return processLargeData()
})

console.log(`Memory used: ${memoryUsed}MB`)
```

## Current Benchmarks

### Router Benchmarks (`router.bench.test.ts`)

Tests performance of routing utilities:

- **Path Parsing**: `parsePath()` performance for simple and complex paths
- **Path Prefix**: `addPathPrefix()` with various inputs
- **Path Suffix**: `addPathSuffix()` with various inputs
- **Route Matching**: Static, dynamic, and catch-all route matching
- **Route Compilation**: RegEx generation for different route patterns

### Utilities Benchmarks (`utilities.bench.test.ts`)

Tests performance of shared utilities:

- **Regex Escaping**: `escapeStringRegexp()` for various string patterns
- **Type Checking**: `isPlainObject()` for different object types
- **Pattern Matching**: `matchRemotePattern()` for image URL validation
- **Stress Tests**: Batch operations on large datasets

## Performance Thresholds

Current thresholds for critical operations:

| Operation           | Max Time | Warning |
| ------------------- | -------- | ------- |
| Route Matching      | 1ms      | 0.5ms   |
| Path Parsing        | 0.5ms    | 0.3ms   |
| Route Compilation   | 10ms     | 5ms     |
| Config Loading      | 100ms    | 50ms    |
| Escape RegExp       | 0.1ms    | 0.05ms  |
| Is Plain Object     | 0.05ms   | 0.02ms  |
| Match Remote Pattern| 1ms      | 0.5ms   |

## Best Practices

### Writing Benchmarks

1. **Use Warmup Iterations**: The benchmark utilities automatically run warmup iterations to ensure JIT compilation doesn't skew results.

2. **Choose Appropriate Iteration Counts**:
   - Very fast operations (< 0.1ms): 10,000+ iterations
   - Fast operations (0.1-10ms): 1,000 iterations
   - Slow operations (> 10ms): 100 iterations

3. **Name Your Benchmarks**: Use descriptive names that match the threshold configuration.

4. **Test Real-World Scenarios**: Benchmark with realistic data that represents actual usage.

### Interpreting Results

Benchmark results include:

- **Average Duration**: Mean execution time across all iterations
- **Min/Max Duration**: Best and worst execution times
- **Status**: ✅ PASSED, ⚠️ WARNING, or ❌ FAILED based on thresholds

### When a Benchmark Fails

If a benchmark fails:

1. **Verify the Change**: Ensure your code changes caused the regression
2. **Profile the Code**: Use Chrome DevTools or Node.js profiler to identify bottlenecks
3. **Optimize**: Refactor the slow code path
4. **Re-test**: Run the benchmark again to confirm the fix
5. **Update Threshold**: If the change is justified, update the threshold in `benchmark.config.js`

## Continuous Integration

These benchmarks can be integrated into CI/CD:

```yaml
# .github/workflows/performance.yml
- name: Run performance benchmarks
  run: pnpm test test/performance/**/*.bench.test.ts

- name: Check for regressions
  run: |
    # Compare with baseline and fail if regression > 10%
```

## Future Improvements

- [ ] Baseline tracking: Store benchmark results over time
- [ ] Regression detection: Automatically detect performance regressions
- [ ] Visual reports: Generate charts showing performance trends
- [ ] Build-time benchmarks: Measure full build performance
- [ ] Bundle size tracking: Monitor bundle size changes
- [ ] Memory profiling: Track heap allocations during operations

## Contributing

When adding new benchmarks:

1. Create a new `.bench.test.ts` file in this directory
2. Add thresholds to `benchmark.config.js`
3. Use the benchmark utilities from `benchmark-utils.ts`
4. Document the benchmark in this README
5. Ensure benchmarks pass in CI before merging

## Resources

- [Performance Testing Guide](https://nextjs.org/docs/advanced-features/performance)
- [Jest Performance Testing](https://jestjs.io/docs/timer-mocks)
- [Web Performance APIs](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
