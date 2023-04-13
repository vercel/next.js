const os = require('os')
const path = require('path')
const execa = require('execa')
const fs = require('fs-extra')
const childProcess = require('child_process')
const { randomBytes } = require('crypto')
const { linkPackages } =
  require('../../.github/actions/next-stats-action/src/prepare/repo-setup')()

async function createNextInstall({
  parentSpan = null,
  dependencies = null,
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
      require('console').log('Creating next instance in:')
      require('console').log(installDir)

      const pkgPaths = await rootSpan
        .traceChild('linkPackages')
        .traceAsyncFn(() =>
          linkPackages({
            repoDir: origRepoDir,
          })
        )

      let combinedDependencies = dependencies

      if (onlyPackages) {
        return pkgPaths
      }

      if (!(packageJson && packageJson.nextParamateSkipLocalDeps)) {
        if (onlyPackages) {
          return pkgPaths
        }

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

      return installDir
    })
}

module.exports = {
  createNextInstall,
  getPkgPaths: linkPackages,
}
