const os = require('os')
const path = require('path')
const execa = require('execa')
const fs = require('fs-extra')
const childProcess = require('child_process')
const { randomBytes } = require('crypto')
const { linkPackages } =
  require('../../.github/actions/next-stats-action/src/prepare/repo-setup')()

async function createNextInstall({
  parentSpan,
  dependencies,
  installCommand,
  packageJson = {},
  dirSuffix = '',
}) {
  return await parentSpan
    .traceChild('createNextInstall')
    .traceAsyncFn(async (rootSpan) => {
      const tmpDir = await fs.realpath(process.env.NEXT_TEST_DIR || os.tmpdir())
      const origRepoDir = path.join(__dirname, '../../')
      const tmpRepoDir = path.join(
        tmpDir,
        `next-repo-${randomBytes(32).toString('hex')}${dirSuffix}`
      )

      const installDir = path.join(
        tmpDir,
        `next-install-${randomBytes(32).toString('hex')}${dirSuffix}`
      )

      require('console').log('Creating next instance in:')
      require('console').log(installDir)

      await rootSpan.traceChild('ensure swc binary').traceAsyncFn(async () => {
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
          .traceAsyncFn(async () => {
            await fs.copy(
              path.join(origRepoDir, item),
              path.join(tmpRepoDir, item),
              {
                filter: (item) => {
                  return (
                    !item.includes('node_modules') &&
                    !item.includes('.DS_Store') &&
                    // Exclude Rust compilation files
                    !/next[\\/]build[\\/]swc[\\/]target/.test(item) &&
                    !/next-swc[\\/]target/.test(item)
                  )
                },
              }
            )
          })
      }

      let combinedDependencies = dependencies

      if (!(packageJson && packageJson.nextPrivateSkipLocalDeps)) {
        const pkgPaths = await rootSpan
          .traceChild('linkPackages')
          .traceAsyncFn(() =>
            linkPackages({
              repoDir: tmpRepoDir,
            })
          )
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
          },
          null,
          2
        )
      )

      if (installCommand) {
        const installString =
          typeof installCommand === 'function'
            ? installCommand({ dependencies: combinedDependencies })
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
          .traceAsyncFn(async () => {
            const args = [
              'install',
              '--strict-peer-dependencies=false',
              '--no-frozen-lockfile',
            ]

            if (process.env.NEXT_TEST_PREFER_OFFLINE === '1') {
              args.push('--prefer-offline')
            }

            await execa('pnpm', args, {
              cwd: installDir,
              stdio: ['ignore', 'inherit', 'inherit'],
              env: process.env,
            })
          })
      }

      await fs.remove(tmpRepoDir)
      return installDir
    })
}

module.exports = {
  createNextInstall,
  getPkgPaths: linkPackages,
}
