const path = require('path')
const fs = require('fs-extra')
const exec = require('../util/exec')
const { remove } = require('fs-extra')
const logger = require('../util/logger')
const semver = require('semver')
const execa = require('execa')

module.exports = (actionInfo) => {
  return {
    async cloneRepo(repoPath = '', dest = '') {
      await remove(dest)
      await exec(`git clone ${actionInfo.gitRoot}${repoPath} ${dest}`)
    },
    async checkoutRef(ref = '', repoDir = '') {
      await exec(`cd ${repoDir} && git fetch && git checkout ${ref}`)
    },
    async getLastStable(repoDir = '', ref) {
      const { stdout } = await exec(`cd ${repoDir} && git tag -l`)
      const tags = stdout.trim().split('\n')
      let lastStableTag

      for (let i = tags.length - 1; i >= 0; i--) {
        const curTag = tags[i]
        // stable doesn't include `-canary` or `-beta`
        if (!curTag.includes('-') && !ref.includes(curTag)) {
          if (!lastStableTag || semver.gt(curTag, lastStableTag)) {
            lastStableTag = curTag
          }
        }
      }
      return lastStableTag
    },
    async getCommitId(repoDir = '') {
      const { stdout } = await exec(`cd ${repoDir} && git rev-parse HEAD`)
      return stdout.trim()
    },
    async resetToRef(ref = '', repoDir = '') {
      await exec(`cd ${repoDir} && git reset --hard ${ref}`)
    },
    async mergeBranch(ref = '', origRepoDir = '', destRepoDir = '') {
      await exec(`cd ${destRepoDir} && git remote add upstream ${origRepoDir}`)
      await exec(`cd ${destRepoDir} && git fetch upstream`)

      try {
        await exec(`cd ${destRepoDir} && git merge upstream/${ref}`)
        logger('Auto merge of main branch successful')
      } catch (err) {
        logger.error('Failed to auto merge main branch:', err)

        if (err.stdout && err.stdout.includes('CONFLICT')) {
          await exec(`cd ${destRepoDir} && git merge --abort`)
          logger('aborted auto merge')
        }
      }
    },
    async linkPackages({ repoDir, nextSwcVersion }) {
      const repoDirPkg = require(path.join(repoDir, 'package.json'))
      const hasTestPackAll = Boolean(repoDirPkg.scripts['test-pack-all'])
      if (!hasTestPackAll) {
        // This code will be executed only when running comparison stats against latest stable.
        // This code is not thread safe (that's what test-pack-all does), but it should be fine here, since main tests won't use this code path.
        // TODO: remove this code when we release new stable (this was added right after 13.3.0)
        execa.sync('pnpm', ['turbo', 'run', 'test-pack'], {
          cwd: repoDir,
          env: { NEXT_SWC_VERSION: nextSwcVersion },
        })
      } else {
        execa.sync('pnpm', ['test-pack-all'], {
          cwd: repoDir,
          env: { NEXT_SWC_VERSION: nextSwcVersion },
        })
      }
      const pkgPaths = new Map()
      const pkgs = (await fs.readdir(path.join(repoDir, 'packages'))).filter(
        (item) => !item.startsWith('.')
      )

      pkgs.forEach((pkgDirname) => {
        const { name } = require(path.join(
          repoDir,
          'packages',
          pkgDirname,
          'package.json'
        ))
        pkgPaths.set(
          name,
          path.join(repoDir, 'packages', pkgDirname, `packed-${pkgDirname}.tgz`)
        )
      })
      return pkgPaths
    },
  }
}
