const path = require('path')
const fs = require('fs-extra')
const exec = require('../util/exec')
const { remove } = require('fs-extra')
const logger = require('../util/logger')

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
          lastStableTag = curTag
          break
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
    async linkPackages(repoDir = '') {
      const pkgPaths = new Map()
      const pkgDatas = new Map()
      let pkgs

      try {
        pkgs = await fs.readdir(path.join(repoDir, 'packages'))
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log('no packages to link')
          return pkgPaths
        }
        throw err
      }

      for (const pkg of pkgs) {
        const pkgPath = path.join(repoDir, 'packages', pkg)
        const packedPkgPath = path.join(pkgPath, `${pkg}-packed.tgz`)
        // pack the package with yarn
        await exec(`cd ${pkgPath} && yarn pack --out ${pkg}-packed.tgz`)

        const pkgDataPath = path.join(pkgPath, 'package.json')
        const pkgData = require(pkgDataPath)
        const { name } = pkgData
        pkgDatas.set(name, { pkgDataPath, pkgData, packedPkgPath })
        pkgPaths.set(name, packedPkgPath)
      }

      for (const pkg of pkgDatas.keys()) {
        const { pkgDataPath, pkgData } = pkgDatas.get(pkg)

        for (const pkg of pkgDatas.keys()) {
          const { packedPkgPath } = pkgDatas.get(pkg)
          if (!pkgData.dependencies || !pkgData.dependencies[pkg]) continue
          pkgData.dependencies[pkg] = packedPkgPath
        }
        await fs.writeFile(
          pkgDataPath,
          JSON.stringify(pkgData, null, 2),
          'utf8'
        )
      }
      return pkgPaths
    },
  }
}
