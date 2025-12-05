/**
 * Performance benchmarks for utility functions
 */

import { benchmark, expectBenchmarkToPass } from './benchmark-utils'
import { escapeStringRegexp } from '../../packages/next/src/shared/lib/escape-regexp'
import { isPlainObject } from '../../packages/next/src/shared/lib/is-plain-object'
import { matchRemotePattern } from '../../packages/next/src/shared/lib/match-remote-pattern'
import type { RemotePattern } from '../../packages/next/src/shared/lib/image-config'

describe('Utilities Performance Benchmarks', () => {
  describe('escapeStringRegexp', () => {
    it('should escape simple strings efficiently', () => {
      const result = benchmark(
        () => {
          escapeStringRegexp('hello.world')
        },
        {
          iterations: 10000,
          name: 'escape-regexp',
        }
      )

      console.log(
        `escapeStringRegexp (simple): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should escape complex strings efficiently', () => {
      const result = benchmark(
        () => {
          escapeStringRegexp('.*+?^${}()|[]\\')
        },
        {
          iterations: 10000,
          name: 'escape-regexp',
        }
      )

      console.log(
        `escapeStringRegexp (complex): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should handle strings without special chars efficiently', () => {
      const result = benchmark(
        () => {
          escapeStringRegexp('normalstring')
        },
        {
          iterations: 10000,
          name: 'escape-regexp',
        }
      )

      console.log(
        `escapeStringRegexp (no special chars): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })
  })

  describe('isPlainObject', () => {
    it('should check plain objects efficiently', () => {
      const obj = { a: 1, b: 2, c: 3 }

      const result = benchmark(
        () => {
          isPlainObject(obj)
        },
        {
          iterations: 10000,
          name: 'is-plain-object',
        }
      )

      console.log(
        `isPlainObject (plain object): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should check arrays efficiently', () => {
      const arr = [1, 2, 3]

      const result = benchmark(
        () => {
          isPlainObject(arr)
        },
        {
          iterations: 10000,
          name: 'is-plain-object',
        }
      )

      console.log(
        `isPlainObject (array): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should check null efficiently', () => {
      const result = benchmark(
        () => {
          isPlainObject(null)
        },
        {
          iterations: 10000,
          name: 'is-plain-object',
        }
      )

      console.log(
        `isPlainObject (null): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should check class instances efficiently', () => {
      class MyClass {}
      const instance = new MyClass()

      const result = benchmark(
        () => {
          isPlainObject(instance)
        },
        {
          iterations: 10000,
          name: 'is-plain-object',
        }
      )

      console.log(
        `isPlainObject (class instance): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })
  })

  describe('matchRemotePattern', () => {
    it('should match exact hostname efficiently', () => {
      const pattern: RemotePattern = {
        hostname: 'example.com',
      }
      const url = new URL('https://example.com/image.jpg')

      const result = benchmark(
        () => {
          matchRemotePattern(pattern, url)
        },
        {
          iterations: 10000,
          name: 'match-remote-pattern',
        }
      )

      console.log(
        `matchRemotePattern (exact): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should match wildcard hostname efficiently', () => {
      const pattern: RemotePattern = {
        hostname: '**.example.com',
      }
      const url = new URL('https://cdn.images.example.com/image.jpg')

      const result = benchmark(
        () => {
          matchRemotePattern(pattern, url)
        },
        {
          iterations: 10000,
          name: 'match-remote-pattern',
        }
      )

      console.log(
        `matchRemotePattern (wildcard): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should match complex pattern efficiently', () => {
      const pattern: RemotePattern = {
        protocol: 'https',
        hostname: '**.example.com',
        port: '',
        pathname: '/images/**',
      }
      const url = new URL('https://cdn.example.com/images/2023/photo.jpg')

      const result = benchmark(
        () => {
          matchRemotePattern(pattern, url)
        },
        {
          iterations: 10000,
          name: 'match-remote-pattern',
        }
      )

      console.log(
        `matchRemotePattern (complex): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })
  })

  describe('stress tests', () => {
    it('should handle large number of route regex escapes', () => {
      const strings = Array.from({ length: 100 }, (_, i) => `path${i}.*+?^$`)

      const result = benchmark(
        () => {
          strings.forEach((str) => escapeStringRegexp(str))
        },
        {
          iterations: 100,
          name: 'escape-regexp',
        }
      )

      console.log(
        `escapeStringRegexp (100 strings): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should handle large number of object checks', () => {
      const objects = Array.from({ length: 100 }, (_, i) => ({ id: i }))

      const result = benchmark(
        () => {
          objects.forEach((obj) => isPlainObject(obj))
        },
        {
          iterations: 100,
          name: 'is-plain-object',
        }
      )

      console.log(
        `isPlainObject (100 objects): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })
  })
})
