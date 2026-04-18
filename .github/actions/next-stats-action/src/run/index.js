const path = require('path')
const os = require('os')
const fs = require('fs/promises')
const gzipSize = require('gzip-size')
const glob = require('../util/glob')
const exec = require('../util/exec')
const logger = require('../util/logger')
const getDirSize = require('./get-dir-size')
const collectStats = require('./collect-stats')
const collectDiffs = require('./collect-diffs')
const { statsAppDir, diffRepoDir } = require('../constants')
const { calcStats } = require('../util/stats')

// Location of the native binary that the workflow copies into the action dir.
// From src/run/index.js → .github/actions/next-stats-action/native
const nativeBinaryDir = path.join(__dirname, '../../native')

async function listNativeBinaries() {
  try {
    const entries = await fs.readdir(nativeBinaryDir)
    return entries
      .filter((e) => e.endsWith('.node'))
      .map((e) => path.join(nativeBinaryDir, e))
  } catch {
    return []
  }
}

// Raw file size on disk (sum across all *.node files).
async function getSwcBinarySize(files) {
  let total = 0
  let found = 0
  for (const file of files) {
    const stat = await fs.stat(file)
    if (stat.isFile()) {
      total += stat.size
      found++
    }
  }
  return found === 0 ? null : total
}

// Gzipped size of the binary (sum across all *.node files).
async function getSwcBinaryGzipSize(files) {
  if (files.length === 0) return null
  let total = 0
  for (const file of files) {
    total += await gzipSize.file(file)
  }
  return total
}

// Stripped size: copy the binary, run `strip --strip-unneeded`, then stat it.
// Returns null if `strip` is unavailable or fails.
async function getSwcBinaryStrippedSize(files) {
  if (files.length === 0) return null
  let tmpDir
  try {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swc-strip-'))
    let total = 0
    for (const file of files) {
      const dest = path.join(tmpDir, path.basename(file))
      await fs.copyFile(file, dest)
      await exec.spawnPromise(
        `strip --strip-unneeded ${JSON.stringify(dest)}`,
        {
          stdio: 'pipe',
        }
      )
      const stat = await fs.stat(dest)
      total += stat.size
    }
    return total
  } catch (err) {
    logger(`Unable to measure stripped SWC binary size: ${err.message}`)
    return null
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

// Number of iterations for build benchmarks to get stable median
const BUILD_BENCHMARK_ITERATIONS = 5

// Bundler configurations for dual-bundler benchmarking
const BUNDLERS = [
  { name: 'Webpack', flag: '--webpack', suffix: 'Webpack' },
  { name: 'Turbopack', flag: '', suffix: 'Turbo' },
]

async function runConfigs(
  configs = [],
  {
    statsConfig,
    relativeStatsAppDir,
    mainRepoPkgPaths,
    diffRepoPkgPaths,
    bundlerFilter = null,
  },
  diffing = false
) {
  // Filter bundlers based on input
  const bundlersToRun = bundlerFilter
    ? BUNDLERS.filter((b) => b.name.toLowerCase() === bundlerFilter)
    : BUNDLERS

  if (bundlerFilter && bundlersToRun.length === 0) {
    throw new Error(
      `Invalid bundler filter: ${bundlerFilter}. Must be 'webpack' or 'turbopack'`
    )
  }

  logger(
    `Running benchmarks for bundlers: ${bundlersToRun.map((b) => b.name).join(', ')}`
  )

  const results = []

  for (const config of configs) {
    logger(`Running config: ${config.title}${diffing ? ' (diff)' : ''}`)

    let mainRepoStats
    let diffRepoStats
    let diffs

    for (const pkgPaths of [mainRepoPkgPaths, diffRepoPkgPaths]) {
      let curStats = {
        General: {
          nodeModulesSize: null,
          swcBinarySize: null,
          swcBinaryStrippedSize: null,
          swcBinaryGzipSize: null,
        },
      }

      // if stats-config is in root of project we're analyzing
      // the whole project so copy from each repo
      const curStatsAppPath = path.join(diffRepoDir, relativeStatsAppDir)

      // clean statsAppDir
      await fs.rm(statsAppDir, { recursive: true, force: true })
      await fs.cp(curStatsAppPath, statsAppDir, { recursive: true })

      logger(`Copying ${curStatsAppPath} ${statsAppDir}`)

      // apply config files
      for (const configFile of config.configFiles || []) {
        const filePath = path.join(statsAppDir, configFile.path)
        await fs.writeFile(filePath, configFile.content, 'utf8')
      }

      // links local builds of the packages and installs dependencies
      await linkPkgs(statsAppDir, pkgPaths)

      if (!diffing) {
        curStats.General.nodeModulesSize = await getDirSize(
          path.join(statsAppDir, 'node_modules')
        )
        const nativeBinaries = await listNativeBinaries()
        curStats.General.swcBinarySize = await getSwcBinarySize(nativeBinaries)
        curStats.General.swcBinaryStrippedSize =
          await getSwcBinaryStrippedSize(nativeBinaries)
        curStats.General.swcBinaryGzipSize =
          await getSwcBinaryGzipSize(nativeBinaries)
      }

      // Run builds for selected bundler(s) and collect stats separately
      for (const bundler of bundlersToRun) {
        logger(`\n=== ${bundler.name} Production Build ===`)

        // Build base command without --webpack flag (we add it per bundler)
        const baseBuildCommand = statsConfig.appBuildCommand.replace(
          / --webpack/g,
          ''
        )
        const buildCommand = bundler.flag
          ? `${baseBuildCommand} ${bundler.flag}`
          : baseBuildCommand

        // Run multiple fresh build iterations for stable timing
        const freshBuildTimes = []
        logger(`  Fresh build (${BUILD_BENCHMARK_ITERATIONS} iterations)...`)
        for (let i = 0; i < BUILD_BENCHMARK_ITERATIONS; i++) {
          // Clean .next directory for fresh build
          await fs.rm(path.join(statsAppDir, '.next'), {
            recursive: true,
            force: true,
          })

          const buildStart = Date.now()
          console.log(await exec(`cd ${statsAppDir} && ${buildCommand}`, false))
          const buildDuration = Date.now() - buildStart
          freshBuildTimes.push(buildDuration)
          logger(`    Iteration ${i + 1}: ${buildDuration}ms`)
        }

        const freshStats = calcStats(freshBuildTimes)
        logger(
          `  Fresh build: median=${freshStats.median}ms, range=${freshStats.min}-${freshStats.max}ms`
        )
        curStats.General[`buildDuration${bundler.suffix}`] = freshStats.median

        // Run cached build iterations BEFORE renames (renames invalidate cache)
        const cachedBuildTimes = []
        logger(`  Cached build (${BUILD_BENCHMARK_ITERATIONS} iterations)...`)
        for (let i = 0; i < BUILD_BENCHMARK_ITERATIONS; i++) {
          const buildStart = Date.now()
          console.log(await exec(`cd ${statsAppDir} && ${buildCommand}`, false))
          const buildDuration = Date.now() - buildStart
          cachedBuildTimes.push(buildDuration)
          logger(`    Iteration ${i + 1}: ${buildDuration}ms`)
        }

        const cachedStats = calcStats(cachedBuildTimes)
        logger(
          `  Cached build: median=${cachedStats.median}ms, range=${cachedStats.min}-${cachedStats.max}ms`
        )
        curStats.General[`buildDurationCached${bundler.suffix}`] =
          cachedStats.median

        // Apply renames to get deterministic output names (after cached builds)
        for (const rename of config.renames) {
          const renameResults = await glob(rename.srcGlob, { cwd: statsAppDir })
          for (const result of renameResults) {
            let dest = rename.removeHash
              ? result.replace(/(\.|-)[0-9a-f]{16}(\.|-)/g, '$1HASH$2')
              : rename.dest
            if (result === dest) continue
            try {
              await fs.rename(
                path.join(statsAppDir, result),
                path.join(statsAppDir, dest)
              )
            } catch (e) {
              // File may not exist for this bundler
            }
          }
        }

        // Collect file stats for this bundler (after renames for deterministic names)
        const collectedStats = await collectStats(
          config,
          statsConfig,
          false,
          bundler.suffix
        )

        for (const key of Object.keys(collectedStats)) {
          // Prefix group names with bundler suffix (except General which is shared)
          const groupKey = key === 'General' ? key : `${key} (${bundler.name})`
          curStats[groupKey] = Object.assign(
            {},
            curStats[groupKey],
            collectedStats[key]
          )
        }
      }

      // Run benchmarks for selected bundler(s) - dev boot and prod start
      const benchmarkStats = await collectStats(
        config,
        statsConfig,
        false,
        null,
        true,
        bundlerFilter
      )
      for (const key of Object.keys(benchmarkStats)) {
        curStats[key] = Object.assign({}, curStats[key], benchmarkStats[key])
      }

      const applyRenames = (renames, stats) => {
        if (renames) {
          for (const rename of renames) {
            let { cur, prev } = rename
            cur = path.basename(cur)
            prev = path.basename(prev)

            Object.keys(stats).forEach((group) => {
              if (stats[group][cur]) {
                stats[group][prev] = stats[group][cur]
                stats[group][prev + ' gzip'] = stats[group][cur + ' gzip']
                delete stats[group][cur]
                delete stats[group][cur + ' gzip']
              }
            })
          }
        }
      }

      if (mainRepoStats) {
        diffRepoStats = curStats

        if (!diffing && config.diff !== false) {
          for (const groupKey of Object.keys(curStats)) {
            if (groupKey === 'General') continue
            let changeDetected = config.diff === 'always'

            const curDiffs = await collectDiffs(config.filesToTrack)
            changeDetected = changeDetected || Object.keys(curDiffs).length > 0

            applyRenames(curDiffs._renames, diffRepoStats)
            delete curDiffs._renames

            if (changeDetected) {
              logger('Detected change, running diff')
              diffs = await runConfigs(
                [
                  {
                    ...config,
                    configFiles: config.diffConfigFiles,
                  },
                ],
                {
                  statsConfig,
                  mainRepoPkgPaths,
                  diffRepoPkgPaths,
                  relativeStatsAppDir,
                  bundlerFilter,
                },
                true
              )
              delete diffs._renames
              break
            }
          }
        }

        if (diffing) {
          // copy new files and get diff results
          return collectDiffs(config.filesToTrack)
        }
      } else {
        // set up diffing folder and copy initial files
        await collectDiffs(config.filesToTrack, true)

        /* eslint-disable-next-line */
        mainRepoStats = curStats
      }
    }

    logger(`Finished running: ${config.title}`)

    results.push({
      title: config.title,
      mainRepoStats,
      diffRepoStats,
      diffs,
    })
  }

  return results
}

async function linkPkgs(pkgDir = '', pkgPaths) {
  await fs.rm(path.join(pkgDir, 'node_modules'), {
    recursive: true,
    force: true,
  })

  const pkgJsonPath = path.join(pkgDir, 'package.json')
  const pkgData = require(pkgJsonPath)

  if (!pkgData.dependencies && !pkgData.devDependencies) return

  const overrides = {}
  for (const [pkg, pkgPath] of pkgPaths.entries()) {
    if (pkgData.dependencies && pkgData.dependencies[pkg]) {
      pkgData.dependencies[pkg] = pkgPath
    } else if (pkgData.devDependencies && pkgData.devDependencies[pkg]) {
      pkgData.devDependencies[pkg] = pkgPath
    } else {
      overrides[pkg] = pkgPath
    }
  }

  if (Object.keys(overrides).length > 0) {
    pkgData.pnpm = {
      ...(pkgData.pnpm || {}),
      overrides: { ...(pkgData.pnpm?.overrides || {}), ...overrides },
    }
    pkgData.overrides = { ...(pkgData.overrides || {}), ...overrides }
    pkgData.resolutions = { ...(pkgData.resolutions || {}), ...overrides }
  }

  await fs.writeFile(pkgJsonPath, JSON.stringify(pkgData, null, 2), 'utf8')

  await exec(
    `cd ${pkgDir} && pnpm install --strict-peer-dependencies=false --package-import-method=copy`,
    false
  )
}

module.exports = runConfigs
