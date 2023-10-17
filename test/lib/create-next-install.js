const os = require('os')
const path = require('path')
const execa = require('execa')
const fs = require('fs-extra')
const childProcess = require('child_process')
const { randomBytes } = require('crypto')
const { linkPackages } =
  require('../../.github/actions/next-stats-action/src/prepare/repo-setup')()

/**
 * Sets the `resolution-mode` for pnpm in the specified directory.
 *
 * See [pnpm/.npmrc#resolution-mode]{@link https://pnpm.io/npmrc#resolution-mode} and
 * [GitHub Issue]{@link https://github.com/pnpm/pnpm/issues/6463}
 *
 * @param {string} cwd - The project directory where pnpm configuration is set.
 * @returns {Promise<void>}
 */
function setPnpmResolutionMode(cwd) {
  return execa(
    'pnpm',
    ['config', 'set', '--location=project', 'resolution-mode', 'highest'],
    {
      cwd: cwd,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
    }
  )
}

async function createNextInstall({
  parentSpan = null,
  dependencies = null,
  resolutions = null,
  installCommand = null,
  packageJson = {},
  dirSuffix = '',
  onlyPackages = false,
  keepRepoDir = false,
}) {
  return await parentSpan
    .traceChild('createNextInstall')
    .traceAsyncFn(async (rootSpan) => {
      const tmpDir = await fs.realpath(process.env.NEXT_TEST_DIR || os.tmpdir())
      const origRepoDir = path.join(__dirname, '../../')
      const installDir = path.join(
        tmpDir,
        `next-install-${randomBytes(32).toString('hex')}${dirSuffix}`
      )
      let tmpRepoDir
      require('console').log('Creating next instance in:')
      require('console').log(installDir)

      let pkgPaths = process.env.NEXT_TEST_PKG_PATHS

      if (pkgPaths) {
        pkgPaths = new Map(JSON.parse(pkgPaths))
        require('console').log('using provided pkg paths')
      } else {
        tmpRepoDir = path.join(
          tmpDir,
          `next-repo-${randomBytes(32).toString('hex')}${dirSuffix}`
        )
        require('console').log('Creating temp repo dir', tmpRepoDir)

        await rootSpan
          .traceChild('ensure swc binary')
          .traceAsyncFn(async () => {
            // ensure swc binary is present in the native folder if
            // not already built
            for (const folder of await fs.readdir(
              path.join(origRepoDir, 'node_modules/@next')
            )) {
              if (folder.startsWith('swc-')) {
                const swcPkgPath = path.join(
                  origRepoDir,
                  'node_modules/@next',
                  folder
                )
                const outputPath = path.join(
                  origRepoDir,
                  'packages/next-swc/native'
                )
                await fs.copy(swcPkgPath, outputPath, {
                  filter: (item) => {
                    return (
                      item === swcPkgPath ||
                      (item.endsWith('.node') &&
                        !fs.pathExistsSync(
                          path.join(outputPath, path.basename(item))
                        ))
                    )
                  },
                })
              }
            }
          })

        for (const item of ['package.json', 'packages']) {
          await rootSpan
            .traceChild(`copy ${item} to temp dir`)
            .traceAsyncFn(() =>
              fs.copy(
                path.join(origRepoDir, item),
                path.join(tmpRepoDir, item),
                {
                  filter: (item) => {
                    return (
                      !item.includes('node_modules') &&
                      !item.includes('pnpm-lock.yaml') &&
                      !item.includes('.DS_Store') &&
                      // Exclude Rust compilation files
                      !/next[\\/]build[\\/]swc[\\/]target/.test(item) &&
                      !/next-swc[\\/]target/.test(item)
                    )
                  },
                }
              )
            )
        }

        pkgPaths = await rootSpan.traceChild('linkPackages').traceAsyncFn(() =>
          linkPackages({
            repoDir: tmpRepoDir,
          })
        )
      }
      let combinedDependencies = dependencies

      if (onlyPackages) {
        return pkgPaths
      }
      if (!(packageJson && packageJson.nextParamateSkipLocalDeps)) {
        combinedDependencies = {
          next: pkgPaths.get('next'),
          ...Object.keys(dependencies).reduce((prev, pkg) => {
            const pkgPath = pkgPaths.get(pkg)
            prev[pkg] = pkgPath || dependencies[pkg]
            return prev
          }, {}),
        }
      }

      await fs.ensureDir(installDir)
      await fs.writeFile(
        path.join(installDir, 'package.json'),
        JSON.stringify(
          {
            ...packageJson,
            dependencies: combinedDependencies,
            private: true,
            // Add resolutions if provided.
            ...(resolutions ? { resolutions } : {}),
          },
          null,
          2
        )
      )
      await setPnpmResolutionMode(installDir)

      if (installCommand) {
        const installString =
          typeof installCommand === 'function'
            ? installCommand({
                dependencies: combinedDependencies,
                resolutions,
              })
            : installCommand

        console.log('running install command', installString)
        rootSpan.traceChild('run custom install').traceFn(() => {
          childProcess.execSync(installString, {
            cwd: installDir,
            stdio: ['ignore', 'inherit', 'inherit'],
          })
        })
      } else {
        await rootSpan
          .traceChild('run generic install command')
          .traceAsyncFn(() => {
            const args = [
              'install',
              '--strict-peer-dependencies=false',
              '--no-frozen-lockfile',
            ]

            if (process.env.NEXT_TEST_PREFER_OFFLINE === '1') {
              args.push('--prefer-offline')
            }

            return execa('pnpm', args, {
              cwd: installDir,
              stdio: ['ignore', 'inherit', 'inherit'],
              env: process.env,
            })
          })
      }

      if (!keepRepoDir && tmpRepoDir) {
        await fs.remove(tmpRepoDir)
      }
      if (keepRepoDir) {
        return {
          installDir,
          pkgPaths,
          tmpRepoDir,
        }
      }
      return installDir
    })
}

module.exports = {
  setPnpmResolutionMode,
  createNextInstall,
  getPkgPaths: linkPackages,
}
