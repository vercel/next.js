const path = require('path')
const fs = require('fs/promises')
const { existsSync } = require('fs')
const exec = require('./util/exec')
const logger = require('./util/logger')
const runConfigs = require('./run')
const addComment = require('./add-comment')
const actionInfo = require('./prepare/action-info')()
const { mainRepoDir, diffRepoDir, pnpmStoreDir } = require('./constants')
const loadStatsConfig = require('./prepare/load-stats-config')
const { cloneRepo, mergeBranch, getCommitId, linkPackages, getLastStable } =
  require('./prepare/repo-setup')(actionInfo)

const allowedActions = new Set(['synchronize', 'opened'])

// Get bundler filter from action input (set by GitHub Actions as INPUT_BUNDLER)
const bundlerInput = (process.env.INPUT_BUNDLER || 'both').toLowerCase()
const isShardedRun = bundlerInput !== 'both'

if (isShardedRun) {
  logger(`Running in sharded mode for bundler: ${bundlerInput}`)
}

if (!allowedActions.has(actionInfo.actionName) && !actionInfo.isRelease) {
  logger(
    `Not running for ${actionInfo.actionName} event action on repo: ${actionInfo.prRepo} and ref ${actionInfo.prRef}`
  )
  process.exit(0)
}

;(async () => {
  try {
    if (existsSync(path.join(__dirname, '../SKIP_NEXT_STATS.txt'))) {
      console.log(
        'SKIP_NEXT_STATS.txt file present, exiting stats generation..'
      )
      process.exit(0)
    }

    const { stdout: gitName } = await exec(
      'git config user.name && git config user.email'
    )
    console.log('git author result:', gitName)

    // clone PR/newer repository/ref first to get settings
    if (!actionInfo.skipClone) {
      await cloneRepo(actionInfo.prRepo, diffRepoDir, actionInfo.prRef)
    }

    if (actionInfo.isRelease) {
      process.env.STATS_IS_RELEASE = 'true'
    }

    // load stats config from allowed locations
    const { statsConfig, relativeStatsAppDir } = loadStatsConfig()

    if (actionInfo.isLocal && actionInfo.prRef === statsConfig.mainBranch) {
      throw new Error(
        `'GITHUB_REF' can not be the same as mainBranch in 'stats-config.js'.\n` +
          `This will result in comparing against the same branch`
      )
    }

    if (actionInfo.isLocal) {
      // make sure to use local repo location instead of the
      // one provided in statsConfig
      statsConfig.mainRepo = actionInfo.prRepo
    }

    /* eslint-disable-next-line */
    actionInfo.commitId = await getCommitId(diffRepoDir)

    if (!actionInfo.skipClone) {
      let mainRef = statsConfig.mainBranch

      if (actionInfo.isRelease) {
        logger(`Release detected, using last stable tag: "${actionInfo.prRef}"`)
        const lastStableTag = await getLastStable(diffRepoDir, actionInfo.prRef)
        mainRef = lastStableTag
        if (!lastStableTag) throw new Error('failed to get last stable tag')
        logger(`using latestStable: "${lastStableTag}"`)

        /* eslint-disable-next-line */
        actionInfo.lastStableTag = lastStableTag
        /* eslint-disable-next-line */
        actionInfo.commitId = await getCommitId(diffRepoDir)

        if (!actionInfo.customCommentEndpoint) {
          /* eslint-disable-next-line */
          actionInfo.commentEndpoint = `https://api.github.com/repos/${statsConfig.mainRepo}/commits/${actionInfo.commitId}/comments`
        }
      }

      await cloneRepo(statsConfig.mainRepo, mainRepoDir, mainRef)

      if (!actionInfo.isRelease && statsConfig.autoMergeMain) {
        logger('Attempting auto merge of main branch')
        await mergeBranch(statsConfig.mainBranch, mainRepoDir, diffRepoDir)
      }
    }
    let mainRepoPkgPaths
    let diffRepoPkgPaths

    // run install/initialBuildCommand
    const repoDirs = [mainRepoDir, diffRepoDir]

    for (const dir of repoDirs) {
      logger(`Running initial build for ${dir}`)
      if (!actionInfo.skipClone) {
        // TODO: we can remove this `packageManager` modification once Next.js
        // 16.3 is released, but we must override it for now because 16.2 uses
        // pnpm 9.6.0, which supports different arguments. `diffRepoDir`
        // points to the most recent stable tag.
        const packageJson = path.join(dir, 'package.json')
        const packageJsonContents = JSON.parse(
          await fs.readFile(packageJson, { encoding: 'utf8' })
        )
        packageJsonContents.packageManager = 'pnpm@10.33.0'
        if (packageJsonContents.engines != null) {
          delete packageJsonContents.engines.pnpm
        }
        await fs.writeFile(
          packageJson,
          JSON.stringify(packageJsonContents, null, '  ')
        )

        if (!statsConfig.skipInitialInstall) {
          const command =
            'pnpm install ' +
            // tolerate lockfile changes from merging latest changes
            '--no-frozen-lockfile ' +
            // avoid hardlink issues on self-hosted runners,
            '--package-import-method=clone-or-copy ' +
            // the store is colocated with the workdir to avoid EXDEV copy
            // failures on overlayfs runners.
            `--store-dir=${pnpmStoreDir}`
          await exec.spawnPromise(command, {
            env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
            cwd: dir,
          })

          await exec.spawnPromise(
            statsConfig.initialBuildCommand || 'pnpm build',
            { cwd: dir }
          )
        }
      }

      const nativeDir = path.join(dir, 'packages/next-swc/native')
      await fs
        .cp(path.join(__dirname, '../native'), nativeDir, {
          recursive: true,
          force: true,
        })
        .catch(console.error)

      process.env.NEXT_TEST_NATIVE_DIR = nativeDir

      logger(`Packing packages in ${dir}`)
      const turboJsonPath = path.join(dir, 'turbo.json')
      let hasTurboPackTask = false
      try {
        const turboJson = JSON.parse(
          await fs.readFile(turboJsonPath, { encoding: 'utf8' })
        )
        hasTurboPackTask =
          turboJson.tasks?.['pack-for-isolated-tests'] !== undefined
      } catch {}

      if (hasTurboPackTask) {
        await exec.spawnPromise('pnpm turbo run pack-for-isolated-tests', {
          cwd: dir,
        })
      } else {
        // Temporary fallback because stats action run on the canary branch which does not have the pack-for-isolated-tests task yet.
        logger(
          'turbo task pack-for-isolated-tests not found, falling back to pnpm pack per package'
        )
        const packagesDir = path.join(dir, 'packages')
        const packageFolders = await fs.readdir(packagesDir)
        await Promise.all(
          packageFolders.map(async (folder) => {
            const pkgDir = path.join(packagesDir, folder)
            const pkgJsonPath = path.join(pkgDir, 'package.json')
            if (!existsSync(pkgJsonPath)) return
            try {
              await exec.spawnPromise('pnpm pack --out packed.tgz', {
                cwd: pkgDir,
              })
            } catch (err) {
              logger(`Failed to pack ${folder}: ${err.message}`)
            }
          })
        )
      }

      logger(`Linking packages in ${dir}`)
      const pkgPaths = await linkPackages({
        repoDir: dir,
      })

      if (dir === mainRepoDir) mainRepoPkgPaths = pkgPaths
      else diffRepoPkgPaths = pkgPaths
    }

    // run the configs and collect results
    const results = await runConfigs(statsConfig.configs, {
      statsConfig,
      mainRepoPkgPaths,
      diffRepoPkgPaths,
      relativeStatsAppDir,
      bundlerFilter: isShardedRun ? bundlerInput : null,
    })

    if (isShardedRun) {
      // In sharded mode, save results to JSON for later aggregation
      const resultsPath = path.join(
        process.env.GITHUB_WORKSPACE || process.cwd(),
        `pr-stats-${bundlerInput}.json`
      )
      // Exclude sensitive fields (githubToken) before serializing to JSON
      const { githubToken, ...safeActionInfo } = actionInfo
      await fs.writeFile(
        resultsPath,
        JSON.stringify(
          { results, actionInfo: safeActionInfo, statsConfig },
          null,
          2
        )
      )
      logger(`Saved results to ${resultsPath}`)
    } else {
      // In non-sharded mode, post comment directly
      await addComment(results, actionInfo, statsConfig)
    }

    logger('finished')
    process.exit(0)
  } catch (err) {
    console.error('Error occurred generating stats:')
    console.error(err)
    process.exit(1)
  }
})()
