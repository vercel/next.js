const path = require('path')
const fs = require('fs/promises')
const glob = require('../util/glob')
const exec = require('../util/exec')
const logger = require('../util/logger')
const getDirSize = require('./get-dir-size')
const collectStats = require('./collect-stats')
const collectDiffs = require('./collect-diffs')
const { statsAppDir, diffRepoDir } = require('../constants')

async function runConfigs(
  configs = [],
  { statsConfig, relativeStatsAppDir, mainRepoPkgPaths, diffRepoPkgPaths },
  diffing = false
) {
  const results = []

  for (const config of configs) {
    logger(`Running config: ${config.title}${diffing ? ' (diff)' : ''}`)

    let mainRepoStats
    let diffRepoStats
    let diffs

    let i = 0
    for (const pkgPaths of [mainRepoPkgPaths, diffRepoPkgPaths]) {
      let curStats = {
        General: {
          buildDuration: null,
          buildDurationCached: null,
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
      const pkgJsonPath = path.join(statsAppDir, 'package.json')
      const isMainRepo = i === 0
      if (isMainRepo) {
        // TODO: Remove me before merging
        const original = await fs.readFile(
          path.join(statsAppDir, 'package.json'),
          'utf8'
        )
        await fs.writeFile(
          path.join(statsAppDir, 'package.json'),
          original.replaceAll('^18.2.0', '19.0.0-rc-7771d3a7-20240827'),
          'utf8'
        )
      } else {
        // TODO: Remove me before merging
        const original = await fs.readFile(
          path.join(statsAppDir, 'package.json'),
          'utf8'
        )
        await fs.writeFile(
          path.join(statsAppDir, 'package.json'),
          original.replaceAll('19.0.0-rc-7771d3a7-20240827', '^18.2.0'),
          'utf8'
        )
      }

      const initialPkg = JSON.parse(
        await fs.readFile(path.join(statsAppDir, 'package.json'), 'utf8')
      )

      const pkgData = await linkPkgs(statsAppDir, initialPkg, pkgPaths)
      await fs.writeFile(pkgJsonPath, JSON.stringify(pkgData, null, 2), 'utf8')
      await exec(
        `cd ${statsAppDir} && pnpm install --strict-peer-dependencies=false`,
        false
      )

      if (!diffing) {
        curStats.General.nodeModulesSize = await getDirSize(
          path.join(statsAppDir, 'node_modules')
        )
      }

      const buildStart = Date.now()
      console.log(
        await exec(`cd ${statsAppDir} && ${statsConfig.appBuildCommand}`, false)
      )
      curStats.General.buildDuration = Date.now() - buildStart

      // apply renames to get deterministic output names
      for (const rename of config.renames) {
        const results = await glob(rename.srcGlob, { cwd: statsAppDir })
        for (const result of results) {
          let dest = rename.removeHash
            ? result.replace(/(\.|-)[0-9a-f]{16}(\.|-)/g, '$1HASH$2')
            : rename.dest
          if (result === dest) continue
          await fs.rename(
            path.join(statsAppDir, result),
            path.join(statsAppDir, dest)
          )
        }
      }

      const collectedStats = await collectStats(config, statsConfig)

      for (const key of Object.keys(collectedStats)) {
        curStats[key] = Object.assign({}, curStats[key], collectedStats[key])
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

      const secondBuildStart = Date.now()
      console.log(
        await exec(`cd ${statsAppDir} && ${statsConfig.appBuildCommand}`, false)
      )
      curStats.General.buildDurationCached = Date.now() - secondBuildStart
      i++
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

async function linkPkgs(pkgDir = '', pkgData, pkgPaths) {
  await fs.rm(path.join(pkgDir, 'node_modules'), {
    recursive: true,
    force: true,
  })

  if (!pkgData.dependencies && !pkgData.devDependencies) return

  for (const pkg of pkgPaths.keys()) {
    const pkgPath = pkgPaths.get(pkg)

    if (pkgData.dependencies && pkgData.dependencies[pkg]) {
      pkgData.dependencies[pkg] = pkgPath
    } else if (pkgData.devDependencies && pkgData.devDependencies[pkg]) {
      pkgData.devDependencies[pkg] = pkgPath
    }
  }

  return pkgData
}

module.exports = runConfigs
