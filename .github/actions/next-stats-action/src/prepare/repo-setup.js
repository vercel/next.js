const path = require('path')
const fs = require('fs')
const { existsSync } = require('fs')
const exec = require('../util/exec')
const logger = require('../util/logger')
const execa = require('execa')

module.exports = (actionInfo) => {
  return {
    async cloneRepo(repoPath = '', dest = '', branch = '', depth = '20') {
      await fs.promises.rm(dest, { recursive: true, force: true })
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
      return `${major}.${minor}.${
        Number(patch) - tag.includes('-canary') ? 1 : 0
      }`
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
    /**
     * Runs `pnpm pack` on each package in the `packages` folder of the provided `repoDir`
     * @param {{ repoDir: string, nextSwcVersion: null | string }} options Required options
     * @returns {Promise<Map<string, string>>} List packages key is the package name, value is the path to the packed tar file.'
     */
    async linkPackages({ repoDir, nextSwcVersion }) {
      /** @type {Map<string, string>} */
      const pkgPaths = new Map()
      /** @type {Map<string, { packageJsonPath: string, packagePath: string, packageJson: any, packedPackageTarPath: string }>} */
      const pkgDatas = new Map()

      let packageFolders

      try {
        packageFolders = await fs.promises.readdir(
          path.join(repoDir, 'packages')
        )
      } catch (err) {
        if (err.code === 'ENOENT') {
          require('console').log('no packages to link')
          return pkgPaths
        }
        throw err
      }

      for (const packageFolder of packageFolders) {
        const packagePath = path.join(repoDir, 'packages', packageFolder)
        const packedPackageTarPath = path.join(
          packagePath,
          `${packageFolder}-packed.tgz`
        )
        const packageJsonPath = path.join(packagePath, 'package.json')

        if (!existsSync(packageJsonPath)) {
          require('console').log(`Skipping ${packageFolder}, no package.json`)
          continue
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
        const { name: packageName } = packageJson

        pkgDatas.set(packageName, {
          packageJsonPath,
          packagePath,
          packageJson,
          packedPackageTarPath,
        })
        pkgPaths.set(packageName, packedPackageTarPath)
      }

      for (const [
        packageName,
        { packageJsonPath, packagePath, packageJson },
      ] of pkgDatas.entries()) {
        // This loops through all items to get the packagedPkgPath of each item and add it to pkgData.dependencies
        for (const [
          packageName,
          { packedPackageTarPath },
        ] of pkgDatas.entries()) {
          if (
            !packageJson.dependencies ||
            !packageJson.dependencies[packageName]
          )
            continue
          // Edit the pkgData of the current item to point to the packed tgz
          packageJson.dependencies[packageName] = packedPackageTarPath
        }

        // make sure native binaries are included in local linking
        if (packageName === '@next/swc') {
          packageJson.files ||= []

          packageJson.files.push('native')

          try {
            const swcBinariesDirContents = (
              await fs.promises.readdir(path.join(packagePath, 'native'))
            ).filter((file) => file !== '.gitignore' && file !== 'index.d.ts')

            require('console').log(
              'using swc binaries: ',
              swcBinariesDirContents.join(', ')
            )
          } catch (err) {
            if (err.code === 'ENOENT') {
              require('console').log('swc binaries dir is missing!')
            }
            throw err
          }
        } else if (packageName === 'next') {
          const nextSwcPkg = pkgDatas.get('@next/swc')

          console.log('using swc dep', {
            nextSwcVersion,
            nextSwcPkg,
          })
          if (nextSwcVersion) {
            Object.assign(packageJson.dependencies, {
              '@next/swc-linux-x64-gnu': nextSwcVersion,
            })
          } else {
            if (nextSwcPkg) {
              packageJson.dependencies['@next/swc'] =
                nextSwcPkg.packedPackageTarPath
            }
          }
        }

        await fs.promises.writeFile(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2),
          'utf8'
        )
      }

      // wait to pack packages until after dependency paths have been updated
      // to the correct versions
      await Promise.all(
        Array.from(pkgDatas.entries()).map(
          async ([
            packageName,
            { packagePath: pkgPath, packedPackageTarPath: packedPkgPath },
          ]) => {
            /** @type {null | () => Promise<void>} */
            let cleanup = null

            if (packageName === '@next/swc') {
              // next-swc uses a gitignore to prevent the committing of native builds but it doesn't
              // use files in package.json because it publishes to individual packages based on architecture.
              // When we used yarn to pack these packages the gitignore was ignored so the native builds were packed
              // however npm does respect gitignore when packing so we need to remove it in this specific case
              // to ensure the native builds are packed for use in gh actions and related scripts

              const nativeGitignorePath = path.join(
                pkgPath,
                'native/.gitignore'
              )
              const renamedGitignorePath = path.join(
                pkgPath,
                'disabled-native-gitignore'
              )

              await fs.promises.rename(
                nativeGitignorePath,
                renamedGitignorePath
              )
              cleanup = async () => {
                await fs.promises.rename(
                  renamedGitignorePath,
                  nativeGitignorePath
                )
              }
            }

            const { stdout } = await execa('pnpm', ['pack'], {
              cwd: pkgPath,
              env: {
                ...process.env,
                COREPACK_ENABLE_STRICT: '0',
              },
            })

            const packedFileName = stdout.trim()

            await Promise.all([
              fs.promises.rename(
                path.join(pkgPath, packedFileName),
                packedPkgPath
              ),
              cleanup?.(),
            ])
          }
        )
      )

      return pkgPaths
    },
  }
}
