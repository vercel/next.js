const path = require('path')
const fs = require('fs-extra')
const exec = require('./util/exec')
const logger = require('./util/logger')
const runConfigs = require('./run')
const addComment = require('./add-comment')
const actionInfo = require('./prepare/action-info')()
const { mainRepoDir, diffRepoDir } = require('./constants')
const loadStatsConfig = require('./prepare/load-stats-config')
const {
  cloneRepo,
  checkoutRef,
  mergeBranch,
  getCommitId,
  linkPackages,
  getLastStable,
} = require('./prepare/repo-setup')(actionInfo)

const allowedActions = new Set(['synchronize', 'opened'])

if (!allowedActions.has(actionInfo.actionName) && !actionInfo.isRelease) {
  logger(
    `Not running for ${actionInfo.actionName} event action on repo: ${actionInfo.prRepo} and ref ${actionInfo.prRef}`
  )
  process.exit(0)
}

;(async () => {
  try {
    if (await fs.pathExists(path.join(__dirname, '../SKIP_NEXT_STATS.txt'))) {
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
      await cloneRepo(actionInfo.prRepo, diffRepoDir)
      await checkoutRef(actionInfo.prRef, diffRepoDir)
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

    // clone main repository/ref
    if (!actionInfo.skipClone) {
      await cloneRepo(statsConfig.mainRepo, mainRepoDir)
      await checkoutRef(statsConfig.mainBranch, mainRepoDir)
    }
    /* eslint-disable-next-line */
    actionInfo.commitId = await getCommitId(diffRepoDir)

    if (!actionInfo.skipClone) {
      if (actionInfo.isRelease) {
        logger('Release detected, resetting mainRepo to last stable tag')
        const lastStableTag = await getLastStable(mainRepoDir, actionInfo.prRef)
        if (!lastStableTag) throw new Error('failed to get last stable tag')
        console.log('using latestStable', lastStableTag)
        await checkoutRef(lastStableTag, mainRepoDir)

        /* eslint-disable-next-line */
        actionInfo.lastStableTag = lastStableTag
        /* eslint-disable-next-line */
        actionInfo.commitId = await getCommitId(diffRepoDir)

        if (!actionInfo.customCommentEndpoint) {
          /* eslint-disable-next-line */
          actionInfo.commentEndpoint = `https://api.github.com/repos/${statsConfig.mainRepo}/commits/${actionInfo.commitId}/comments`
        }
      } else if (statsConfig.autoMergeMain) {
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
        let buildCommand = `cd ${dir}${
          !statsConfig.skipInitialInstall
            ? ' && yarn install --network-timeout 1000000'
            : ''
        }`

        if (statsConfig.initialBuildCommand) {
          buildCommand += ` && ${statsConfig.initialBuildCommand}`
        }
        await exec(buildCommand)
      }

      logger(`Linking packages in ${dir}`)
      const pkgPaths = await linkPackages(dir)

      if (dir === mainRepoDir) mainRepoPkgPaths = pkgPaths
      else diffRepoPkgPaths = pkgPaths
    }

    // run the configs and post the comment
    const results = await runConfigs(statsConfig.configs, {
      statsConfig,
      mainRepoPkgPaths,
      diffRepoPkgPaths,
      relativeStatsAppDir,
    })
    await addComment(results, actionInfo, statsConfig)
    logger('finished')
    process.exit(0)
  } catch (err) {
    console.error('Error occurred generating stats:')
    console.error(err)
    process.exit(1)
  }
})()
