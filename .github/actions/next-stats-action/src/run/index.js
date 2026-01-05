const path = require('path')
const fs = require('fs/promises')
const glob = require('../util/glob')
const exec = require('../util/exec')
const logger = require('../util/logger')
const getDirSize = require('./get-dir-size')
const collectStats = require('./collect-stats')
const collectDiffs = require('./collect-diffs')
const { statsAppDir, diffRepoDir } = require('../constants')
const { calcStats } = require('../util/stats')

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

  for (const pkg of pkgPaths.keys()) {
    const pkgPath = pkgPaths.get(pkg)

    if (pkgData.dependencies && pkgData.dependencies[pkg]) {
      pkgData.dependencies[pkg] = pkgPath
    } else if (pkgData.devDependencies && pkgData.devDependencies[pkg]) {
      pkgData.devDependencies[pkg] = pkgPath
    }
  }
  await fs.writeFile(pkgJsonPath, JSON.stringify(pkgData, null, 2), 'utf8')

  await exec(
    `cd ${pkgDir} && pnpm install --strict-peer-dependencies=false`,
    false
  )
}

module.exports = runConfigs
