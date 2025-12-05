/**
 * Performance benchmarks for router utilities
 */

import { benchmark, expectBenchmarkToPass } from './benchmark-utils'
import { parsePath } from '../../packages/next/src/shared/lib/router/utils/parse-path'
import { addPathPrefix } from '../../packages/next/src/shared/lib/router/utils/add-path-prefix'
import { addPathSuffix } from '../../packages/next/src/shared/lib/router/utils/add-path-suffix'
import { getRouteMatcher } from '../../packages/next/src/shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../packages/next/src/shared/lib/router/utils/route-regex'

describe('Router Performance Benchmarks', () => {
  describe('parsePath', () => {
    it('should parse simple paths efficiently', () => {
      const result = benchmark(
        () => {
          parsePath('/foo/bar')
        },
        {
          iterations: 10000,
          name: 'path-parsing',
        }
      )

      console.log(
        `parsePath (simple): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should parse complex paths efficiently', () => {
      const result = benchmark(
        () => {
          parsePath('/foo/bar?query=value&another=param#section')
        },
        {
          iterations: 10000,
          name: 'path-parsing',
        }
      )

      console.log(
        `parsePath (complex): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })
  })

  describe('addPathPrefix', () => {
    it('should add prefix efficiently', () => {
      const result = benchmark(
        () => {
          addPathPrefix('/page', '/base')
        },
        {
          iterations: 10000,
          name: 'path-parsing',
        }
      )

      console.log(
        `addPathPrefix: ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should handle complex paths with prefix efficiently', () => {
      const result = benchmark(
        () => {
          addPathPrefix('/page?query=1#hash', '/base')
        },
        {
          iterations: 10000,
          name: 'path-parsing',
        }
      )

      console.log(
        `addPathPrefix (complex): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })
  })

  describe('addPathSuffix', () => {
    it('should add suffix efficiently', () => {
      const result = benchmark(
        () => {
          addPathSuffix('/page', '.html')
        },
        {
          iterations: 10000,
          name: 'path-parsing',
        }
      )

      console.log(
        `addPathSuffix: ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })
  })

  describe('route matching', () => {
    it('should match static routes efficiently', () => {
      const matcher = getRouteMatcher(getRouteRegex('/about'))

      const result = benchmark(
        () => {
          matcher('/about')
        },
        {
          iterations: 10000,
          name: 'route-matching',
        }
      )

      console.log(
        `route matching (static): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should match dynamic routes efficiently', () => {
      const matcher = getRouteMatcher(getRouteRegex('/blog/[slug]'))

      const result = benchmark(
        () => {
          matcher('/blog/my-post')
        },
        {
          iterations: 10000,
          name: 'route-matching',
        }
      )

      console.log(
        `route matching (dynamic): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should match catch-all routes efficiently', () => {
      const matcher = getRouteMatcher(getRouteRegex('/docs/[...slug]'))

      const result = benchmark(
        () => {
          matcher('/docs/getting-started/installation')
        },
        {
          iterations: 10000,
          name: 'route-matching',
        }
      )

      console.log(
        `route matching (catch-all): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })
  })

  describe('route compilation', () => {
    it('should compile static routes efficiently', () => {
      const result = benchmark(
        () => {
          getRouteRegex('/about')
        },
        {
          iterations: 1000,
          name: 'route-compilation',
        }
      )

      console.log(
        `route compilation (static): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should compile dynamic routes efficiently', () => {
      const result = benchmark(
        () => {
          getRouteRegex('/blog/[slug]')
        },
        {
          iterations: 1000,
          name: 'route-compilation',
        }
      )

      console.log(
        `route compilation (dynamic): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })

    it('should compile catch-all routes efficiently', () => {
      const result = benchmark(
        () => {
          getRouteRegex('/docs/[...slug]')
        },
        {
          iterations: 1000,
          name: 'route-compilation',
        }
      )

      console.log(
        `route compilation (catch-all): ${result.avgDuration.toFixed(4)}ms avg over ${result.iterations} iterations`
      )

      expectBenchmarkToPass(result)
    })
  })
})
