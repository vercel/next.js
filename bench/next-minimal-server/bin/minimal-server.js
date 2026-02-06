#!/usr/bin/env node
process.env.NODE_ENV = 'production'

// CPU profiling: load early so it captures all module loading too
if (process.env.NEXT_CPU_PROF) {
  require('next/dist/server/lib/cpu-profile')
}

require('../../../test/lib/react-channel-require-hook')

// Perf marks collection when NEXT_PERF_MARKS=1
const perfMarksEnabled = !!process.env.NEXT_PERF_MARKS
const markPhases = [
  'ssr:request-start',
  'ssr:render-start',
  'ssr:react-render',
  'ssr:stream-start',
  'ssr:first-byte',
  'ssr:request-end',
]

let markStats = {}

function resetMarkStats() {
  markStats = {}
  for (const name of markPhases) {
    markStats[name] = []
  }
  // Also track durations between consecutive phases
  for (let i = 0; i < markPhases.length - 1; i++) {
    const key = `${markPhases[i]} -> ${markPhases[i + 1]}`
    markStats[key] = []
  }
  markStats['ssr:total'] = []
}

if (perfMarksEnabled) {
  resetMarkStats()

  const { PerformanceObserver } = require('node:perf_hooks')

  // Collect marks per request in a temporary buffer
  let currentMarks = {}

  const obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (markPhases.includes(entry.name)) {
        currentMarks[entry.name] = entry.startTime
        markStats[entry.name].push(entry.startTime)

        // If this is the last mark, compute durations and reset
        if (entry.name === 'ssr:request-end') {
          for (let i = 0; i < markPhases.length - 1; i++) {
            const from = markPhases[i]
            const to = markPhases[i + 1]
            if (currentMarks[from] != null && currentMarks[to] != null) {
              const key = `${from} -> ${to}`
              markStats[key].push(currentMarks[to] - currentMarks[from])
            }
          }
          if (
            currentMarks['ssr:request-start'] != null &&
            currentMarks['ssr:request-end'] != null
          ) {
            markStats['ssr:total'].push(
              currentMarks['ssr:request-end'] -
                currentMarks['ssr:request-start']
            )
          }
          currentMarks = {}
          performance.clearMarks()
        }
      }
    }
  })
  obs.observe({ entryTypes: ['mark'] })

  // On SIGUSR1, print aggregated stats and reset
  process.on('SIGUSR1', () => {
    const durationKeys = Object.keys(markStats).filter(
      (k) => k.includes('->') || k === 'ssr:total'
    )
    if (durationKeys.length === 0) {
      process.stderr.write('No perf marks collected yet.\n')
      return
    }

    const lines = ['', '=== SSR Phase Timing ===']
    for (const key of durationKeys) {
      const values = markStats[key]
      if (values.length === 0) continue
      values.sort((a, b) => a - b)
      const count = values.length
      const min = values[0]
      const max = values[count - 1]
      const p50 = values[Math.floor(count * 0.5)]
      const p95 = values[Math.floor(count * 0.95)]
      const p99 = values[Math.floor(count * 0.99)]
      const avg = values.reduce((s, v) => s + v, 0) / count
      lines.push(
        `  ${key.padEnd(45)} n=${String(count).padStart(5)}  avg=${avg.toFixed(2).padStart(8)}ms  p50=${p50.toFixed(2).padStart(8)}ms  p95=${p95.toFixed(2).padStart(8)}ms  p99=${p99.toFixed(2).padStart(8)}ms  min=${min.toFixed(2).padStart(8)}ms  max=${max.toFixed(2).padStart(8)}ms`
      )
    }
    lines.push('========================', '')
    process.stderr.write(lines.join('\n'))
    resetMarkStats()
  })
}

console.time('next-cold-start')
const NextServer = require('next/dist/server/next-server').default
const path = require('path')

const appDir = process.cwd()
const distDir = '.next'

const compiledConfig = require(
  path.join(appDir, distDir, 'required-server-files.json')
).config

process.chdir(appDir)

const nextServer = new NextServer({
  conf: compiledConfig,
  dir: appDir,
  distDir,
  minimalMode: true,
  customServer: false,
})

const requestHandler = nextServer.getRequestHandler()

const port = parseInt(process.env.PORT || '3000', 10)

// SIGUSR2 triggers saveCpuProfile() and exits
if (process.env.NEXT_CPU_PROF) {
  process.on('SIGUSR2', () => {
    const { saveCpuProfile } = require('next/dist/server/lib/cpu-profile')
    saveCpuProfile()
    setTimeout(() => process.exit(0), 500)
  })
}

require('http')
  .createServer((req, res) => {
    return requestHandler(req, res)
  })
  .listen(port, () => {
    console.timeEnd('next-cold-start')
  })
