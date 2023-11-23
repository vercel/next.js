const os = require('os')
const path = require('path')
const execa = require('execa')
const fs = require('fs')
const fsp = require('fs/promises')
const childProcess = require('child_process')
const { randomBytes } = require('crypto')
const { linkPackages } =
  require('../../.github/actions/next-stats-action/src/prepare/repo-setup')()

const PREFER_OFFLINE = process.env.NEXT_TEST_PREFER_OFFLINE === '1'

async function installDependencies(cwd) {
  const args = [
    'install',
    '--strict-peer-dependencies=false',
    '--no-frozen-lockfile',
  ]

  if (PREFER_OFFLINE) {
    args.push('--prefer-offline')
  }

  await execa('pnpm', args, {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  })
}

async function createNextInstall({
  parentSpan,
  dependencies = {},
  resolutions = null,
  installCommand = null,
  packageJson = {},
  dirSuffix = '',
  keepRepoDir = false,
}) {
  return await parentSpan
    .traceChild('createNextInstall')
    .traceAsyncFn(async (rootSpan) => {
      const tmpDir = await fsp.realpath(
        process.env.NEXT_TEST_DIR || os.tmpdir()
      )
      const origRepoDir = path.join(__dirname, '../../')
      const installDir = path.join(
        tmpDir,
        `next-install-${randomBytes(32).toString('hex')}${dirSuffix}`
      )
      let tmpRepoDir
      require('console').log('Creating next instance in:')
      require('console').log(installDir)

      const pkgPathsEnv = process.env.NEXT_TEST_PKG_PATHS
      let pkgPaths

      if (pkgPathsEnv) {
        pkgPaths = new Map(JSON.parse(pkgPathsEnv))
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
            for (const folder of await fsp.readdir(
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
                await fsp.cp(swcPkgPath, outputPath, {
                  filter: (item) => {
                    return (
                      item === swcPkgPath ||
                      (item.endsWith('.node') &&
                        !fs.existsSync(
                          path.join(outputPath, path.basename(item))
                        ))
                    )
                  },
                  recursive: true,
                })
              }
            }
          })

        for (const item of ['package.json', 'packages']) {
          await rootSpan
            .traceChild(`copy ${item} to temp dir`)
            .traceAsyncFn(() =>
              fsp.cp(
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
                  recursive: true,
                }
              )
            )
        }

        pkgPaths = await rootSpan.traceChild('linkPackages').traceAsyncFn(() =>
          linkPackages({
            repoDir: tmpRepoDir,
            nextSwcVersion: null,
          })
        )
      }
      const combinedDependencies = {
        next: pkgPaths.get('next'),
        ...Object.keys(dependencies).reduce((prev, pkg) => {
          const pkgPath = pkgPaths.get(pkg)
          prev[pkg] = pkgPath || dependencies[pkg]
          return prev
        }, {}),
      }

      await fsp.mkdir(installDir, { recursive: true })
      await fsp.writeFile(
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
          .traceAsyncFn(() => installDependencies(installDir))
      }

      if (!keepRepoDir && tmpRepoDir) {
        await fsp.rm(tmpRepoDir, {
          recursive: true,
          force: true,
          maxRetries: 3,
        })
      }

      return {
        installDir,
        pkgPaths,
        tmpRepoDir,
      }
    })
}

module.exports = {
  createNextInstall,
  getPkgPaths: linkPackages,
}
