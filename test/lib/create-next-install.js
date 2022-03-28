const os = require('os')
const path = require('path')
const execa = require('execa')
const fs = require('fs-extra')
const childProcess = require('child_process')
const { linkPackages } =
  require('../../.github/actions/next-stats-action/src/prepare/repo-setup')()

async function createNextInstall(
  dependencies,
  installCommand,
  packageJson = {}
) {
  const tmpDir = await fs.realpath(process.env.NEXT_TEST_DIR || os.tmpdir())
  const origRepoDir = path.join(__dirname, '../../')
  const installDir = path.join(tmpDir, `next-install-${Date.now()}`)
  const tmpRepoDir = path.join(tmpDir, `next-repo-${Date.now()}`)

  // ensure swc binary is present in the native folder if
  // not already built
  for (const folder of await fs.readdir(
    path.join(origRepoDir, 'node_modules/@next')
  )) {
    if (folder.startsWith('swc-')) {
      const swcPkgPath = path.join(origRepoDir, 'node_modules/@next', folder)
      const outputPath = path.join(origRepoDir, 'packages/next-swc/native')
      await fs.copy(swcPkgPath, outputPath, {
        filter: (item) => {
          return (
            item === swcPkgPath ||
            (item.endsWith('.node') &&
              !fs.pathExistsSync(path.join(outputPath, path.basename(item))))
          )
        },
      })
    }
  }

  for (const item of ['package.json', 'yarn.lock', 'packages']) {
    await fs.copy(path.join(origRepoDir, item), path.join(tmpRepoDir, item), {
      filter: (item) => {
        return (
          !item.includes('node_modules') &&
          !item.includes('.DS_Store') &&
          // Exclude Rust compilation files
          !/next[\\/]build[\\/]swc[\\/]target/.test(item)
        )
      },
    })
  }

  const pkgPaths = await linkPackages(tmpRepoDir)
  const combinedDependencies = {
    ...Object.keys(dependencies).reduce((prev, pkg) => {
      const pkgPath = pkgPaths.get(pkg)
      prev[pkg] = pkgPath || dependencies[pkg]
      return prev
    }, {}),
    next: pkgPaths.get('next'),
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

    childProcess.execSync(installString, {
      cwd: installDir,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
  } else {
    await execa('yarn', ['install'], {
      cwd: installDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        YARN_CACHE_FOLDER: path.join(installDir, '.yarn-cache'),
      },
    })
  }

  await fs.remove(tmpRepoDir)
  return installDir
}

module.exports = {
  createNextInstall,
}
