const path = require('path')
const fs = require('fs-extra')
const exec = require('../util/exec')
const { remove } = require('fs-extra')
const logger = require('../util/logger')
const semver = require('semver')

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
    async linkPackages(repoDir = '', nextSwcPkg) {
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

        const pkgDataPath = path.join(pkgPath, 'package.json')
        if (!fs.existsSync(pkgDataPath)) {
          console.log(`Skipping ${pkgDataPath}`)
          continue
        }
        const pkgData = require(pkgDataPath)
        if (pkgData?.scripts?.prepublishOnly) {
          // There's a bug in `pnpm pack` where it will run
          // the prepublishOnly script and that will fail.
          // See https://github.com/pnpm/pnpm/issues/2941
          delete pkgData.scripts.prepublishOnly
          await fs.writeFile(pkgDataPath, JSON.stringify(pkgData, null, 2))
        }
        const { name, version } = pkgData
        pkgDatas.set(name, {
          pkgDataPath,
          pkg,
          pkgPath,
          pkgData,
          packedPkgPath,
          version,
        })
        pkgPaths.set(name, packedPkgPath)
      }

      for (const pkg of pkgDatas.keys()) {
        const { pkgDataPath, pkgData } = pkgDatas.get(pkg)

        for (const pkg of pkgDatas.keys()) {
          const { packedPkgPath } = pkgDatas.get(pkg)
          if (!pkgData.dependencies || !pkgData.dependencies[pkg]) continue
          pkgData.dependencies[pkg] = packedPkgPath
        }
        // make sure native binaries are included in local linking
        if (pkg === '@next/swc') {
          if (!pkgData.files) {
            pkgData.files = []
          }
          pkgData.files.push('native')
          console.log(
            'using swc binaries: ',
            await exec(`ls ${path.join(path.dirname(pkgDataPath), 'native')}`)
          )
        }
        if (pkg === 'next') {
          if (nextSwcPkg) {
            Object.assign(pkgData.dependencies, nextSwcPkg)
          } else {
            if (pkgDatas.get('@next/swc')) {
              pkgData.dependencies['@next/swc'] =
                pkgDatas.get('@next/swc').packedPkgPath
            } else {
              pkgData.files.push('native')
            }
          }
        }
        await fs.writeFile(
          pkgDataPath,
          JSON.stringify(pkgData, null, 2),
          'utf8'
        )
      }

      // wait to pack packages until after dependency paths have been updated
      // to the correct versions
      for (const pkgName of pkgDatas.keys()) {
        const { pkg, pkgPath, version } = pkgDatas.get(pkgName)
        await exec(`cd ${pkgPath} && pnpm pack`, true)
        const files = await fs.readdir(pkgPath)
        const oldName = files.find((f) =>
          new RegExp(`${pkg}.${version}.tgz$`).test(f)
        )
        const newName = path.join(pkgPath, `${pkg}-packed.tgz`)
        console.log(`renaming ${oldName} to ${newName}`)
        await fs.move(oldName, newName)
      }
      return pkgPaths
    },
  }
}
