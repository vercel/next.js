const path = require('path')
const fs = require('fs/promises')
const { existsSync } = require('fs')
const exec = require('../util/exec')
const glob = require('../util/glob')
const logger = require('../util/logger')
const { statsAppDir, diffingDir } = require('../constants')

module.exports = async function collectDiffs(
  filesToTrack = [],
  initial = false
) {
  if (initial) {
    logger('Setting up directory for diffing')
    // set-up diffing directory
    await fs.rm(diffingDir, { recursive: true, force: true })
    await fs.mkdir(diffingDir, { recursive: true })
    await exec(`cd ${diffingDir} && git init`)
  } else {
    // remove any previous files in case they won't be overwritten
    const toRemove = await glob('!(.git)', { cwd: diffingDir, dot: true })

    await Promise.all(
      toRemove.map((file) =>
        fs.rm(path.join(diffingDir, file), { recursive: true, force: true })
      )
    )
  }
  const diffs = {}

  await Promise.all(
    filesToTrack.map(async (fileGroup) => {
      const { globs } = fileGroup
      const curFiles = []
      const prettierExts = ['.js', '.html', '.css', '.json']

      await Promise.all(
        globs.map(async (pattern) => {
          curFiles.push(
            ...(await glob(pattern, { cwd: statsAppDir })).filter((item) =>
              prettierExts.includes(path.extname(item))
            )
          )
        })
      )

      logger('Tracking the following files:')
      logger(curFiles)

      for (let file of curFiles) {
        const absPath = path.join(statsAppDir, file)

        const diffDest = path.join(diffingDir, file)
        await fs.cp(absPath, diffDest, { recursive: true, force: true })
      }

      if (curFiles.length > 0) {
        const prettierPath = path.join(
          __dirname,
          '../../node_modules/.bin/prettier'
        )
        await exec(
          `cd "${process.env.LOCAL_STATS ? process.cwd() : diffingDir}" && ` +
            `${prettierPath} --write --no-error-on-unmatched-pattern ${curFiles
              .map((f) => path.join(diffingDir, f))
              .join(' ')}`
        )
      }
    })
  )

  await exec(`cd ${diffingDir} && git add .`, true)

  if (initial) {
    await exec(`cd ${diffingDir} && git commit -m 'initial commit'`)
  } else {
    let { stdout: renamedFiles } = await exec(
      `cd ${diffingDir} && git diff --name-status HEAD`
    )
    renamedFiles = renamedFiles
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('R'))

    diffs._renames = []

    for (const line of renamedFiles) {
      const [, prev, cur] = line.split('\t')
      await fs.rename(path.join(diffingDir, cur), path.join(diffingDir, prev))
      diffs._renames.push({
        prev,
        cur,
      })
    }

    await exec(`cd ${diffingDir} && git add .`)

    let { stdout: changedFiles } = await exec(
      `cd ${diffingDir} && git diff --name-only HEAD`
    )
    changedFiles = changedFiles.trim().split('\n')

    for (const file of changedFiles) {
      const fileKey = path.basename(file)
      const hasFile = existsSync(path.join(diffingDir, file))

      if (!hasFile) {
        diffs[fileKey] = 'deleted'
        continue
      }

      try {
        let { stdout } = await exec(
          `cd ${diffingDir} && git diff --minimal HEAD ${file}`
        )
        stdout = (stdout.split(file).pop() || '').trim()
        if (stdout.length > 0 && !isLikelyHashOrIDChange(stdout)) {
          diffs[fileKey] = stdout
        }
      } catch (err) {
        console.error(`Failed to diff ${file}: ${err.message}`)
        diffs[fileKey] = `failed to diff`
      }
    }
  }
  return diffs
}

function isLikelyHashOrIDChange(diff) {
  const lines = diff.split('\n')
  let additions = []
  let deletions = []

  // Separate additions and deletions
  for (const line of lines) {
    if (line.startsWith('+')) {
      additions.push(line.substring(1).split(/\b/))
    } else if (line.startsWith('-')) {
      deletions.push(line.substring(1).split(/\b/))
    }
  }

  // If the number of additions and deletions is different, it's not a hash or ID change
  if (additions.length !== deletions.length) {
    return false
  }

  // Compare each addition with each deletion
  for (let i = 0; i < additions.length; i++) {
    const additionTokens = additions[i]
    const deletionTokens = deletions[i]

    // Identify differing tokens
    const differingTokens = additionTokens.filter(
      (token, index) => token !== deletionTokens[index]
    )

    // Analyze differing tokens
    for (const token of differingTokens) {
      const isLikelyHash = /^[a-f0-9]+$/.test(token)
      const isLikelyID = /^[0-9]+$/.test(token)
      // this is most likely noise because some path include the repo name, which can be main or diff
      const isLikelyNoise = ['main', 'diff'].includes(token)

      if (!isLikelyHash && !isLikelyID && !isLikelyNoise) {
        return false
      }
    }
  }

  return true
}
