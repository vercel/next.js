#!/usr/bin/env node
/**
 * Dev Server Boot Time Benchmark
 *
 * Usage:
 *   node scripts/benchmark-boot.js [options]
 *
 * Options:
 *   --iterations=N    Number of iterations (default: 5)
 *   --test-dir=PATH   Test project directory (default: /private/tmp/next-boot-test)
 *   --bundled         Use bundled dev server (default)
 *   --unbundled       Use unbundled dev server
 *   --compare         Run both bundled and unbundled for comparison
 *   --turbopack       Use Turbopack (default)
 *   --webpack         Use Webpack
 */

const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// Parse arguments
const args = process.argv.slice(2)
const getArg = (name, defaultValue) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.split('=')[1] : defaultValue
}
const hasFlag = (name) => args.includes(`--${name}`)

const iterations = parseInt(getArg('iterations', '5'), 10)
const testDir = getArg('test-dir', '/private/tmp/next-boot-test')
const compare = hasFlag('compare')
const useWebpack = hasFlag('webpack')
const bundlerFlag = useWebpack ? '--webpack' : '--turbopack'

const nextDir = path.join(__dirname, '..', 'packages', 'next')
const nextBin = path.join(nextDir, 'dist/bin/next')
const cliSource = path.join(nextDir, 'src/cli/next-dev.ts')

console.log('\x1b[34m=== Next.js Dev Server Boot Benchmark ===\x1b[0m')
console.log(`Iterations: ${iterations}`)
console.log(`Test directory: ${testDir}`)
console.log(`Bundler: ${useWebpack ? 'Webpack' : 'Turbopack'}`)
console.log('')

// Verify test directory exists
if (!fs.existsSync(testDir)) {
  console.error(
    `\x1b[31mError: Test directory does not exist: ${testDir}\x1b[0m`
  )
  console.log('Create a test project first:')
  console.log(`  mkdir -p ${testDir} && cd ${testDir}`)
  console.log('  pnpm init && pnpm add next@canary react react-dom')
  console.log(
    '  mkdir -p app && echo "export default function Page() { return <h1>Hello</h1> }" > app/page.tsx'
  )
  process.exit(1)
}

// Kill existing next dev processes
function killNextDev() {
  try {
    execSync('pkill -f "next dev"', { stdio: 'ignore' })
  } catch {}
}

// Run a single benchmark iteration
function runIteration() {
  return new Promise((resolve, reject) => {
    // Clean .next directory
    const nextCache = path.join(testDir, '.next')
    if (fs.existsSync(nextCache)) {
      fs.rmSync(nextCache, { recursive: true, force: true })
    }

    const startTime = Date.now()
    let resolved = false

    const child = spawn(nextBin, ['dev', bundlerFlag], {
      cwd: testDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    let output = ''

    const onData = (data) => {
      output += data.toString()
      // Look for "Ready in Xms" pattern
      const match = output.match(/Ready in (\d+)ms/)
      if (match && !resolved) {
        resolved = true
        const reportedTime = parseInt(match[1], 10)
        const actualTime = Date.now() - startTime
        child.kill('SIGTERM')
        resolve({ reportedTime, actualTime })
      }
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    // Timeout after 60 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        child.kill('SIGKILL')
        reject(new Error('Timeout waiting for server to start'))
      }
    }, 60000)
  })
}

// Run benchmark with multiple iterations
async function runBenchmark(name) {
  console.log(`\x1b[33mRunning ${name}...\x1b[0m`)

  const reportedTimes = []
  const actualTimes = []

  for (let i = 1; i <= iterations; i++) {
    try {
      killNextDev()
      await new Promise((r) => setTimeout(r, 500))

      const { reportedTime, actualTime } = await runIteration()
      reportedTimes.push(reportedTime)
      actualTimes.push(actualTime)
      console.log(
        `  Run ${i}: ${reportedTime}ms (reported) / ${actualTime}ms (actual)`
      )
    } catch (err) {
      console.log(`  Run ${i}: Failed - ${err.message}`)
    }
  }

  killNextDev()

  if (reportedTimes.length === 0) {
    console.log('\x1b[31mNo successful runs\x1b[0m')
    return null
  }

  // Calculate statistics
  const calcStats = (times) => {
    const sum = times.reduce((a, b) => a + b, 0)
    const avg = Math.round(sum / times.length)
    const min = Math.min(...times)
    const max = Math.max(...times)
    const sorted = [...times].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    return { avg, min, max, median, count: times.length }
  }

  const reported = calcStats(reportedTimes)
  const actual = calcStats(actualTimes)

  console.log(`\x1b[32mResults for ${name}:\x1b[0m`)
  console.log(`  Reported time (Next.js internal):`)
  console.log(
    `    Avg: ${reported.avg}ms | Min: ${reported.min}ms | Max: ${reported.max}ms | Median: ${reported.median}ms`
  )
  console.log(`  Actual time (CLI to ready):`)
  console.log(
    `    Avg: ${actual.avg}ms | Min: ${actual.min}ms | Max: ${actual.max}ms | Median: ${actual.median}ms`
  )
  console.log('')

  return { reported, actual }
}

// Switch between bundled/unbundled
function setBundled(useBundled) {
  const content = fs.readFileSync(cliSource, 'utf-8')

  const bundledPath = `require.resolve(
    '../compiled/dev-server/start-server'
  )`
  const unbundledPath = `require.resolve('../server/lib/start-server')`

  let newContent
  if (useBundled) {
    newContent = content.replace(
      /const startServerPath = require\.resolve\(['"]\.\.\/server\/lib\/start-server['"]\)/,
      `const startServerPath = ${bundledPath}`
    )
  } else {
    newContent = content.replace(
      /const startServerPath = require\.resolve\(\s*['"]\.\.\/compiled\/dev-server\/start-server['"]\s*\)/,
      `const startServerPath = ${unbundledPath}`
    )
  }

  if (newContent !== content) {
    fs.writeFileSync(cliSource, newContent)
    // Rebuild CLI
    console.log(`Rebuilding CLI (${useBundled ? 'bundled' : 'unbundled'})...`)
    execSync('npx taskr cli', { cwd: nextDir, stdio: 'ignore' })
  }
}

// Main
async function main() {
  killNextDev()

  if (compare) {
    // Run both bundled and unbundled
    setBundled(true)
    const bundledResults = await runBenchmark('Bundled dev server')

    setBundled(false)
    const unbundledResults = await runBenchmark('Unbundled dev server')

    // Restore to bundled
    setBundled(true)

    // Print comparison
    console.log('\x1b[34m=== Comparison ===\x1b[0m')
    if (bundledResults && unbundledResults) {
      const reportedDiff =
        bundledResults.reported.avg - unbundledResults.reported.avg
      const actualDiff = bundledResults.actual.avg - unbundledResults.actual.avg

      console.log(
        `Reported time difference: ${reportedDiff > 0 ? '+' : ''}${reportedDiff}ms (${reportedDiff > 0 ? 'bundled slower' : 'bundled faster'})`
      )
      console.log(
        `Actual time difference: ${actualDiff > 0 ? '+' : ''}${actualDiff}ms (${actualDiff > 0 ? 'bundled slower' : 'bundled faster'})`
      )
    }
  } else {
    await runBenchmark('Dev server')
  }

  console.log('\x1b[32mDone!\x1b[0m')
}

main().catch(console.error)
