const path = require('path')
const fs = require('fs')
const { existsSync } = require('fs')
const exec = require('../util/exec')
const logger = require('../util/logger')
const execa = require('execa')

const mockSpan = () => ({
  traceAsyncFn: (fn) => fn(mockSpan()),
  traceFn: (fn) => fn(mockSpan()),
  traceChild: () => mockSpan(),
})

module.exports = (actionInfo) => {
  return {
    async cloneRepo(repoPath = '', dest = '', branch = '', depth = '20') {
      await fs.promises.rm(dest, { recursive: true, force: true })
      await exec(
        `git clone ${actionInfo.gitRoot}${repoPath} --single-branch --branch ${branch} --depth=${depth} ${dest}`
      )
    },
    async getLastStable() {
      const res = await fetch(
        `https://api.github.com/repos/vercel/next.js/releases/latest`,
        {
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      )

      if (!res.ok) {
        throw new Error(
          `Failed to get latest stable tag ${res.status}: ${await res.text()}`
        )
      }
      const data = await res.json()
      return data.tag_name
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
    async linkPackages({
      repoDir,
      nextSwcVersion: nextSwcVersionSpecified,
      parentSpan,
    }) {
      if (!parentSpan) {
        // Not all callers provide a parent span
        parentSpan = mockSpan()
      }
      /** @type {Map<string, string>} */
      const pkgPaths = new Map()
      /** @type {Map<string, { packageJsonPath: string, packagePath: string, packageJson: any, packedPackageTarPath: string }>} */
      const pkgDatas = new Map()

      let packageFolders

      try {
        packageFolders = await parentSpan
          .traceChild('read-packages-folder')
          .traceAsyncFn(() =>
            fs.promises.readdir(path.join(repoDir, 'packages'))
          )
      } catch (err) {
        if (err.code === 'ENOENT') {
          require('console').log('no packages to link')
          return pkgPaths
        }
        throw err
      }

      parentSpan.traceChild('get-pkgdatas').traceFn(() => {
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
      })

      const nextSwcVersion =
        nextSwcVersionSpecified ??
        pkgDatas.get('@next/swc')?.packedPackageTarPath ??
        null

      await parentSpan
        .traceChild('write-packagejson')
        .traceAsyncFn(async () => {
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
                ).filter(
                  (file) => file !== '.gitignore' && file !== 'index.d.ts'
                )

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
                  // CI
                  '@next/swc-linux-x64-gnu': nextSwcVersion,
                  // Vercel issued laptops
                  '@next/swc-darwin-arm64': nextSwcVersion,
                })
              }
            }

            await fs.promises.writeFile(
              packageJsonPath,
              JSON.stringify(packageJson, null, 2),
              'utf8'
            )
          }
        })

      await parentSpan
        .traceChild('pnpm-packing')
        .traceAsyncFn(async (packingSpan) => {
          // wait to pack packages until after dependency paths have been updated
          // to the correct versions
          await Promise.all(
            Array.from(pkgDatas.entries()).map(
              async ([
                packageName,
                { packagePath: pkgPath, packedPackageTarPath: packedPkgPath },
              ]) => {
                return packingSpan
                  .traceChild('handle-package', { packageName })
                  .traceAsyncFn(async (handlePackageSpan) => {
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

                      await handlePackageSpan
                        .traceChild('rename-gitignore')
                        .traceAsyncFn(() =>
                          fs.promises.rename(
                            nativeGitignorePath,
                            renamedGitignorePath
                          )
                        )
                      cleanup = async () => {
                        await fs.promises.rename(
                          renamedGitignorePath,
                          nativeGitignorePath
                        )
                      }
                    }

                    const options = {
                      cwd: pkgPath,
                      env: {
                        ...process.env,
                        COREPACK_ENABLE_STRICT: '0',
                      },
                    }
                    let execResult
                    try {
                      execResult = await handlePackageSpan
                        .traceChild('pnpm-pack-try-1')
                        .traceAsyncFn(() => execa('pnpm', ['pack'], options))
                    } catch {
                      execResult = await handlePackageSpan
                        .traceChild('pnpm-pack-try-2')
                        .traceAsyncFn(() => execa('pnpm', ['pack'], options))
                    }
                    const { stdout } = execResult

                    const packedFileName = stdout.trim()

                    await handlePackageSpan
                      .traceChild('rename-packed-tar-and-cleanup')
                      .traceAsyncFn(() =>
                        Promise.all([
                          fs.promises.rename(
                            path.join(pkgPath, packedFileName),
                            packedPkgPath
                          ),
                          cleanup?.(),
                        ])
                      )
                  })
              }
            )
          )
        })

      return pkgPaths
    },
  }
}
