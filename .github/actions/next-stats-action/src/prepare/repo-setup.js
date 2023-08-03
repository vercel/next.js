const path = require('path')
const fs = require('fs-extra')
const exec = require('../util/exec')
const { remove } = require('fs-extra')
const logger = require('../util/logger')
const execa = require('execa')

module.exports = (actionInfo) => {
  return {
    async cloneRepo(repoPath = '', dest = '', branch = '', depth = '20') {
      await remove(dest)
      await exec(
        `git clone ${actionInfo.gitRoot}${repoPath} --single-branch --branch ${branch} --depth=${depth} ${dest}`
      )
    },
    async getLastStable(repoDir = '') {
      const { stdout } = await exec(`cd ${repoDir} && git describe`)
      const tag = stdout.trim()

      if (!tag || !tag.startsWith('v')) {
        throw new Error(`Failed to get tag info: "${stdout}"`)
      }
      const [major, minor, patch] = tag.split('-canary')[0].split('.')
      if (!major || !minor || !patch) {
        throw new Error(
          `Failed to split tag into major/minor/patch: "${stdout}"`
        )
      }
      // last stable tag will always be 1 patch less than canary
      return `${major}.${minor}.${Number(patch) - 1}`
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
      const pkgPaths = new Map()
      const pkgDatas = new Map()
      let pkgs

      try {
        pkgs = await fs.readdir(path.join(repoDir, 'packages'))
      } catch (err) {
        if (err.code === 'ENOENT') {
          require('console').log('no packages to link')
          return pkgPaths
        }
        throw err
      }

      for (const pkg of pkgs) {
        const pkgPath = path.join(repoDir, 'packages', pkg)
        const packedPkgPath = path.join(pkgPath, `${pkg}-packed.tgz`)

        const pkgDataPath = path.join(pkgPath, 'package.json')
        if (!fs.existsSync(pkgDataPath)) {
          require('console').log(`Skipping ${pkgDataPath}`)
          continue
        }
        const pkgData = require(pkgDataPath)
        const { name } = pkgData

        pkgDatas.set(name, {
          pkgDataPath,
          pkg,
          pkgPath,
          pkgData,
          packedPkgPath,
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
          require('console').log(
            'using swc binaries: ',
            await exec(`ls ${path.join(path.dirname(pkgDataPath), 'native')}`)
          )
        }

        if (pkg === 'next') {
          console.log('using swc dep', {
            nextSwcVersion,
            nextSwcPkg: pkgDatas.get('@next/swc'),
          })
          if (nextSwcVersion) {
            Object.assign(pkgData.dependencies, {
              '@next/swc-linux-x64-gnu': nextSwcVersion,
            })
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
      await Promise.all(
        Array.from(pkgDatas.keys()).map(async (pkgName) => {
          const { pkgPath, packedPkgPath } = pkgDatas.get(pkgName)

          let cleanup = null

          if (pkgName === '@next/swc') {
            // next-swc uses a gitignore to prevent the committing of native builds but it doesn't
            // use files in package.json because it publishes to individual packages based on architecture.
            // When we used yarn to pack these packages the gitignore was ignored so the native builds were packed
            // however npm does respect gitignore when packing so we need to remove it in this specific case
            // to ensure the native builds are packed for use in gh actions and related scripts
            await fs.rename(
              path.join(pkgPath, 'native/.gitignore'),
              path.join(pkgPath, 'disabled-native-gitignore')
            )
            cleanup = async () => {
              await fs.rename(
                path.join(pkgPath, 'disabled-native-gitignore'),
                path.join(pkgPath, 'native/.gitignore')
              )
            }
          }

          const { stdout } = await execa('npm', ['pack'], {
            cwd: pkgPath,
            env: {
              ...process.env,
              COREPACK_ENABLE_STRICT: '0',
            },
          })
          await fs.rename(path.resolve(pkgPath, stdout.trim()), packedPkgPath)
          if (cleanup) {
            await cleanup()
          }
        })
      )
      return pkgPaths
    },
  }
}
