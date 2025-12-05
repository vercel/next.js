/**
 * Performance Benchmark Configuration for Next.js
 *
 * This configuration defines performance regression testing thresholds
 * for critical operations in the Next.js codebase.
 */

module.exports = {
  // Performance thresholds (in milliseconds) for critical operations
  thresholds: {
    // Router operations
    'route-matching': {
      max: 1, // Route matching should be < 1ms
      warn: 0.5, // Warn if > 0.5ms
    },
    'path-parsing': {
      max: 0.5, // Path parsing should be < 0.5ms
      warn: 0.3,
    },
    'route-compilation': {
      max: 10, // Route compilation can be slower
      warn: 5,
    },

    // Build operations
    'config-loading': {
      max: 100, // Config loading should be < 100ms
      warn: 50,
    },
    'page-discovery': {
      max: 500, // Page discovery threshold
      warn: 250,
    },

    // Utility operations
    'escape-regexp': {
      max: 0.1, // Simple string operations
      warn: 0.05,
    },
    'is-plain-object': {
      max: 0.05, // Type checking should be very fast
      warn: 0.02,
    },
    'match-remote-pattern': {
      max: 1, // Pattern matching
      warn: 0.5,
    },
  },

  // Number of iterations for each benchmark
  iterations: {
    default: 1000,
    micro: 10000, // For very fast operations
    slow: 100, // For slower operations
  },

  // Bundle size thresholds (in KB)
  bundleSize: {
    'client-runtime': {
      max: 100, // Client runtime bundle
      warn: 90,
    },
    'server-runtime': {
      max: 500, // Server runtime bundle
      warn: 450,
    },
  },

  // Memory usage thresholds (in MB)
  memory: {
    'build-process': {
      max: 2048, // Build shouldn't use more than 2GB
      warn: 1536,
    },
  },
}
