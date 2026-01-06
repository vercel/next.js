const path = require('path')
const net = require('net')
const fs = require('fs/promises')
const { existsSync } = require('fs')
const getPort = require('get-port')
const fetch = require('node-fetch')
const glob = require('../util/glob')
const gzipSize = require('gzip-size')
const logger = require('../util/logger')
const exec = require('../util/exec')
const { spawn } = require('../util/exec')
const { parse: urlParse } = require('url')
const benchmarkUrl = require('./benchmark-url')
const { statsAppDir, diffingDir, benchTitle } = require('../constants')
const { calcStats } = require('../util/stats')

// Number of iterations for timing benchmarks to get stable median
const BENCHMARK_ITERATIONS = 9

// Check if a port is accepting TCP connections
function checkPort(port, timeout = 100) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeout)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, 'localhost')
  })
}

// Wait for port to start accepting TCP connections
async function waitForPort(port, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await checkPort(port)) {
      return Date.now() - start
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

// Wait for HTTP server to respond
async function waitForHttp(port, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/`, { timeout: 2000 })
      if (res.ok) {
        return Date.now() - start
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

// Run a single dev server boot benchmark
async function benchmarkDevBoot(appDevCommand, curDir, port, cleanBuild) {
  // Clean .next directory for cold start
  if (cleanBuild) {
    const nextDir = path.join(curDir, '.next')
    await fs.rm(nextDir, { recursive: true, force: true })
  }

  const startTime = Date.now()
  const devChild = spawn(appDevCommand, {
    cwd: curDir,
    env: {
      PORT: port,
    },
    stdio: 'pipe',
  })

  let exited = false
  devChild.on('exit', () => {
    exited = true
  })

  // Capture output for debugging
  devChild.stdout.on('data', (data) => process.stdout.write(data))
  devChild.stderr.on('data', (data) => process.stderr.write(data))

  // Measure time to port listening (TCP level)
  const listenTime = await waitForPort(port, 60000)

  // Measure time to HTTP ready
  let readyTime = null
  if (listenTime !== null && !exited) {
    readyTime = await waitForHttp(port, 60000)
  }

  devChild.kill()

  // Wait for process to fully exit to avoid port conflicts on subsequent runs
  if (!exited) {
    await new Promise((resolve) => {
      devChild.on('exit', resolve)
      // Timeout after 5 seconds in case process doesn't exit cleanly
      setTimeout(resolve, 5000)
    })
  }

  return {
    listenTime,
    readyTime,
  }
}

// Run multiple iterations of dev boot benchmark and return median times
async function benchmarkDevBootWithIterations(
  appDevCommand,
  curDir,
  port,
  cleanBuild,
  label
) {
  const listenTimes = []
  const readyTimes = []

  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    // For cold start benchmarks, clean before EVERY iteration to get true cold times
    logger(`  ${label} iteration ${i + 1}/${BENCHMARK_ITERATIONS}...`)

    const result = await benchmarkDevBoot(
      appDevCommand,
      curDir,
      port,
      cleanBuild
    )

    if (result.listenTime !== null) {
      listenTimes.push(result.listenTime)
      logger(`    Boot: ${result.listenTime}ms`)
    }
    if (result.readyTime !== null) {
      readyTimes.push(result.readyTime)
      logger(`    Ready: ${result.readyTime}ms`)
    }

    // Small delay between iterations to let system settle
    await new Promise((r) => setTimeout(r, 500))
  }

  const listenStats = calcStats(listenTimes)
  const readyStats = calcStats(readyTimes)

  // Log detailed stats for debugging
  if (listenStats) {
    logger(
      `  ${label} Boot: median=${listenStats.median}ms, range=${listenStats.min}-${listenStats.max}ms, CV=${listenStats.cv}%`
    )
  }
  if (readyStats) {
    logger(
      `  ${label} Ready: median=${readyStats.median}ms, range=${readyStats.min}-${readyStats.max}ms, CV=${readyStats.cv}%`
    )
  }

  return {
    listenTime: listenStats?.median ?? null,
    readyTime: readyStats?.median ?? null,
  }
}

async function defaultGetRequiredFiles(nextAppDir, fileName) {
  return [fileName]
}

module.exports = async function collectStats(
  runConfig = {},
  statsConfig = {},
  fromDiff = false,
  bundlerSuffix = null,
  benchmarkOnly = false,
  bundlerFilter = null
) {
  const stats = {
    [benchTitle]: {},
  }
  const orderedStats = {
    [benchTitle]: {},
  }
  const curDir = fromDiff ? diffingDir : statsAppDir

  // If bundlerSuffix is provided, we're collecting file sizes only (skip benchmarks)
  // If benchmarkOnly is true, we're running benchmarks only (skip file sizes)
  const collectFileSizes = !benchmarkOnly
  const runBenchmarks = !bundlerSuffix

  const hasPagesToFetch =
    Array.isArray(runConfig.pagesToFetch) && runConfig.pagesToFetch.length > 0

  const hasPagesToBench =
    Array.isArray(runConfig.pagesToBench) && runConfig.pagesToBench.length > 0

  // Run production start benchmark FIRST (before dev benchmark which cleans .next)
  // Only run benchmarks when not collecting bundler-specific file sizes
  // Skip production start in sharded mode (bundlerFilter set) as these metrics don't vary by bundler
  if (
    runBenchmarks &&
    !fromDiff &&
    !bundlerFilter &&
    statsConfig.appStartCommand &&
    (hasPagesToFetch || hasPagesToBench)
  ) {
    const port = await getPort()
    const readyTimes = []

    // Helper to run a single production start and measure time
    async function runProdStartTiming() {
      const startTime = Date.now()
      const child = spawn(statsConfig.appStartCommand, {
        cwd: curDir,
        env: {
          PORT: port,
        },
        stdio: 'pipe',
      })

      let serverReadyResolve
      let serverReadyResolved = false
      const serverReadyPromise = new Promise((resolve) => {
        serverReadyResolve = resolve
      })

      child.stdout.on('data', (data) => {
        if (data.toString().includes('- Local:') && !serverReadyResolved) {
          serverReadyResolved = true
          serverReadyResolve()
        }
      })

      child.on('exit', () => {
        if (!serverReadyResolved) {
          serverReadyResolve()
          serverReadyResolved = true
        }
      })

      await serverReadyPromise
      const readyTime = Date.now() - startTime
      child.kill()
      await new Promise((r) => setTimeout(r, 300)) // Let port release
      return readyTime
    }

    // Run multiple timing iterations for stable median
    logger(
      `=== Production Start Benchmark (${BENCHMARK_ITERATIONS} iterations) ===`
    )
    for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
      logger(`  Prod Start iteration ${i + 1}/${BENCHMARK_ITERATIONS}...`)
      const readyTime = await runProdStartTiming()
      readyTimes.push(readyTime)
      logger(`    Ready: ${readyTime}ms`)
    }

    const readyStats = calcStats(readyTimes)
    if (readyStats) {
      logger(
        `  Prod Start: median=${readyStats.median}ms, range=${readyStats.min}-${readyStats.max}ms, CV=${readyStats.cv}%`
      )

      if (!orderedStats['General']) {
        orderedStats['General'] = {}
      }
      orderedStats['General']['nextStartReadyDuration'] = readyStats.median
    } else {
      logger(`  Prod Start: Failed to collect timing data`)
    }

    // Now run one more time to do page fetching/benchmarking
    logger('=== Production Start for Page Fetching ===')
    const startTime = Date.now()
    const child = spawn(statsConfig.appStartCommand, {
      cwd: curDir,
      env: {
        PORT: port,
      },
      stdio: 'pipe',
    })
    let exitCode = null
    let logStderr = true

    let serverReadyResolve
    let serverReadyResolved = false
    const serverReadyPromise = new Promise((resolve) => {
      serverReadyResolve = resolve
    })

    child.stdout.on('data', (data) => {
      if (data.toString().includes('- Local:') && !serverReadyResolved) {
        serverReadyResolved = true
        serverReadyResolve()
      }
      process.stdout.write(data)
    })
    child.stderr.on('data', (data) => logStderr && process.stderr.write(data))

    child.on('exit', (code) => {
      if (!serverReadyResolved) {
        serverReadyResolve()
        serverReadyResolved = true
      }
      exitCode = code
    })

    await serverReadyPromise

    if (exitCode !== null) {
      throw new Error(
        `Failed to run \`${statsConfig.appStartCommand}\` process exited with code ${exitCode}`
      )
    }

    if (hasPagesToFetch) {
      const fetchedPagesDir = path.join(curDir, 'fetched-pages')
      await fs.mkdir(fetchedPagesDir, { recursive: true })

      for (let url of runConfig.pagesToFetch) {
        url = url.replace('$PORT', port)
        const { pathname } = urlParse(url)
        try {
          const res = await fetch(url)
          if (!res.ok) {
            throw new Error(`Failed to fetch ${url} got status: ${res.status}`)
          }
          const responseText = (await res.text()).trim()

          let fileName = pathname === '/' ? '/index' : pathname
          if (fileName.endsWith('/')) fileName = fileName.slice(0, -1)
          logger(
            `Writing file to ${path.join(fetchedPagesDir, `${fileName}.html`)}`
          )

          await fs.writeFile(
            path.join(fetchedPagesDir, `${fileName}.html`),
            responseText,
            'utf8'
          )
        } catch (err) {
          logger.error(err)
        }
      }
    }

    if (hasPagesToBench) {
      // disable stderr so we don't clobber logs while benchmarking
      // any pages that create logs
      logStderr = false

      for (let url of runConfig.pagesToBench) {
        url = url.replace('$PORT', port)
        logger(`Benchmarking ${url}`)

        const results = await benchmarkUrl(url, runConfig.benchOptions)
        logger(`Finished benchmarking ${url}`)

        const { pathname: key } = urlParse(url)
        stats[benchTitle][`${key} failed reqs`] = results.failedRequests
        stats[benchTitle][`${key} total time (seconds)`] = results.totalTime

        stats[benchTitle][`${key} avg req/sec`] = results.avgReqPerSec
      }
    }
    child.kill()
  }

  // Measure dev server boot time if configured
  // Runs full matrix: (Turbopack + Webpack) x (Cold + Warm) x (Boot + Ready)
  // Each timing uses median of BENCHMARK_ITERATIONS runs for stability
  // NOTE: This runs AFTER the production start benchmark because it cleans the .next directory
  // Only run benchmarks when not collecting bundler-specific file sizes
  if (
    runBenchmarks &&
    !fromDiff &&
    statsConfig.appDevCommand &&
    statsConfig.measureDevBoot
  ) {
    const devPort = await getPort()

    if (!orderedStats['General']) {
      orderedStats['General'] = {}
    }

    // Run benchmarks for selected bundler(s)
    // Default is now turbopack, so we need --webpack for webpack
    const allBundlers = [
      { name: 'Turbopack', flag: '', suffix: 'Turbo' },
      { name: 'Webpack', flag: '--webpack', suffix: 'Webpack' },
    ]
    const bundlers = bundlerFilter
      ? allBundlers.filter((b) => b.name.toLowerCase() === bundlerFilter)
      : allBundlers

    for (const bundler of bundlers) {
      logger(`\n=== ${bundler.name} Dev Server Benchmarks ===`)

      // Build the command with the bundler flag
      const devCommand = bundler.flag
        ? `${statsConfig.appDevCommand} ${bundler.flag}`
        : statsConfig.appDevCommand

      // 1. Cold start benchmark (clean .next directory, multiple iterations)
      logger(
        `=== ${bundler.name} Cold Start (${BENCHMARK_ITERATIONS} iterations) ===`
      )
      const coldResult = await benchmarkDevBootWithIterations(
        devCommand,
        curDir,
        devPort,
        true, // clean .next before each iteration
        `${bundler.name} Cold`
      )

      if (coldResult.listenTime !== null) {
        orderedStats['General'][`nextDevColdListenDuration${bundler.suffix}`] =
          coldResult.listenTime
      }
      if (coldResult.readyTime !== null) {
        orderedStats['General'][`nextDevColdReadyDuration${bundler.suffix}`] =
          coldResult.readyTime
      }

      // 2. Warm up bytecode cache by running server for ~10 seconds
      if (coldResult.readyTime !== null) {
        logger(`=== ${bundler.name} Warming up bytecode cache (10s) ===`)
        const warmupChild = spawn(devCommand, {
          cwd: curDir,
          env: {
            PORT: devPort,
          },
          stdio: 'pipe',
        })

        let warmupExited = false
        warmupChild.on('exit', () => {
          warmupExited = true
        })

        // Wait for server to be ready
        await waitForHttp(devPort, 60000)

        // Let it run for 10 seconds to warm bytecode cache
        await new Promise((r) => setTimeout(r, 10000))

        warmupChild.kill()

        // Wait for warmup server to fully exit to avoid port conflicts
        if (!warmupExited) {
          await new Promise((resolve) => {
            warmupChild.on('exit', resolve)
            // Timeout after 5 seconds in case process doesn't exit cleanly
            setTimeout(resolve, 5000)
          })
        }

        // 3. Warm start benchmark (keep .next directory, multiple iterations)
        logger(
          `=== ${bundler.name} Warm Start (${BENCHMARK_ITERATIONS} iterations) ===`
        )
        const warmResult = await benchmarkDevBootWithIterations(
          devCommand,
          curDir,
          devPort,
          false, // keep build
          `${bundler.name} Warm`
        )

        if (warmResult.listenTime !== null) {
          orderedStats['General'][
            `nextDevWarmListenDuration${bundler.suffix}`
          ] = warmResult.listenTime
        }
        if (warmResult.readyTime !== null) {
          orderedStats['General'][`nextDevWarmReadyDuration${bundler.suffix}`] =
            warmResult.readyTime
        }
      }
    }

    logger('\n=== Dev Boot Benchmark Complete ===')
  }

  // Collect file sizes only when not in benchmark-only mode
  if (collectFileSizes) {
    for (const fileGroup of runConfig.filesToTrack) {
      const {
        getRequiredFiles = defaultGetRequiredFiles,
        name,
        globs,
      } = fileGroup
      const groupStats = {}
      const curFiles = new Set()

      for (const pattern of globs) {
        const results = await glob(pattern, { cwd: curDir, nodir: true })
        results.forEach((result) => curFiles.add(result))
      }

      for (const file of curFiles) {
        const fileKey = path.basename(file)
        try {
          let parsedSizeSum = 0
          let gzipSizeSum = 0
          for (const requiredFile of await getRequiredFiles(curDir, file)) {
            const absPath = path.join(curDir, requiredFile)
            const fileInfo = await fs.stat(absPath)
            parsedSizeSum += fileInfo.size
            gzipSizeSum += await gzipSize.file(absPath)
          }
          groupStats[fileKey] = parsedSizeSum
          groupStats[`${fileKey} gzip`] = gzipSizeSum
        } catch (err) {
          logger.error('Failed to get file stats', err)
        }
      }
      stats[name] = groupStats
    }

    for (const fileGroup of runConfig.filesToTrack) {
      const { name } = fileGroup
      orderedStats[name] = stats[name]
    }
  }

  if (stats[benchTitle]) {
    orderedStats[benchTitle] = stats[benchTitle]
  }
  return orderedStats
}
