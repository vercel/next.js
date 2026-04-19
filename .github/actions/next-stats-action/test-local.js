#!/usr/bin/env node
/**
 * Test the stats action comment formatting locally
 *
 * Usage: node test-local.js [--with-history]
 *
 * This generates a sample PR comment using mock data so you can
 * quickly verify formatting changes without running the full action.
 *
 * Options:
 *   --with-history  Simulate KV history data to test trend sparklines
 */

const addComment = require('./src/add-comment')

const withHistory = process.argv.includes('--with-history')

// Mock data simulating real benchmark results
const mockResults = [
  {
    title: 'Default Build',
    mainRepoStats: {
      General: {
        nextDevColdListenDurationTurbo: 280,
        nextDevColdReadyDurationTurbo: 450,
        nextDevWarmListenDurationTurbo: 180,
        nextDevWarmReadyDurationTurbo: 320,
        nextDevColdListenDurationWebpack: 350,
        nextDevColdReadyDurationWebpack: 1200,
        nextDevWarmListenDurationWebpack: 250,
        nextDevWarmReadyDurationWebpack: 800,
        nextStartReadyDuration: 150,
        buildDurationTurbo: 4500,
        buildDurationCachedTurbo: 4200,
        buildDurationWebpack: 14000,
        buildDurationCachedWebpack: 13500,
        nodeModulesSize: 250000000,
      },
    },
    diffRepoStats: {
      General: {
        nextDevColdListenDurationTurbo: 290, // +10ms (insignificant)
        nextDevColdReadyDurationTurbo: 520, // +70ms at 15% (significant regression)
        nextDevWarmListenDurationTurbo: 175, // -5ms (insignificant)
        nextDevWarmReadyDurationTurbo: 280, // -40ms at 12% (significant improvement)
        nextDevColdListenDurationWebpack: 360,
        nextDevColdReadyDurationWebpack: 1180,
        nextDevWarmListenDurationWebpack: 245,
        nextDevWarmReadyDurationWebpack: 790,
        nextStartReadyDuration: 145,
        buildDurationTurbo: 4400,
        buildDurationCachedTurbo: 4250,
        buildDurationWebpack: 13800,
        buildDurationCachedWebpack: 13600,
        nodeModulesSize: 251000000,
      },
    },
    diffs: null,
  },
]

const mockActionInfo = {
  isRelease: false,
  commitId: 'abc123',
  issueId: 12345,
}

const mockStatsConfig = {
  commentHeading: 'Stats from current PR',
}

// Run with LOCAL_STATS to output to file instead of posting
process.env.LOCAL_STATS = 'true'

// Mock the KV module to provide fake history if --with-history is passed
if (withHistory) {
  // Generate mock history entries showing a trend
  const mockHistory = []
  for (let i = 0; i < 10; i++) {
    mockHistory.push({
      commitId: `commit-${i}`,
      timestamp: new Date(Date.now() - i * 86400000).toISOString(),
      metrics: {
        nextDevColdReadyDurationTurbo: 400 + Math.random() * 100, // varies 400-500
        nextDevWarmReadyDurationTurbo: 300 + Math.random() * 50,
        buildDurationTurbo: 4000 + Math.random() * 1000,
      },
    })
  }

  // Inject mock KV client
  process.env.KV_REST_API_URL = 'mock://kv'
  process.env.KV_REST_API_TOKEN = 'mock-token'

  // Patch the require to intercept @vercel/kv
  const Module = require('module')
  const originalRequire = Module.prototype.require
  Module.prototype.require = function (id) {
    if (id === '@vercel/kv') {
      return {
        createClient: () => ({
          lrange: async () => mockHistory,
          rpush: async () => {},
          ltrim: async () => {},
        }),
      }
    }
    return originalRequire.apply(this, arguments)
  }

  console.log('Running with mock history data (10 entries)')
}

addComment(mockResults, mockActionInfo, mockStatsConfig)
  .then(() =>
    console.log(
      '\nGenerated pr-stats.md - open it to see the comment' +
        (withHistory ? ' (with trend sparklines)' : '')
    )
  )
  .catch(console.error)
