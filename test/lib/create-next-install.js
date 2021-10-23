const os = require('os')
const path = require('path')
const execa = require('execa')
const fs = require('fs-extra')
const { linkPackages } =
  require('../../.github/actions/next-stats-action/src/prepare/repo-setup')()

async function createNextInstall(dependencies) {
  const tmpDir = await fs.realpath(process.env.NEXT_TEST_DIR || os.tmpdir())
  const origRepoDir = path.join(__dirname, '../../')
  const installDir = path.join(tmpDir, `next-install-${Date.now()}`)
  const tmpRepoDir = path.join(tmpDir, `next-repo-${Date.now()}`)

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

  await fs.ensureDir(installDir)
  await fs.writeFile(
    path.join(installDir, 'package.json'),
    JSON.stringify(
      {
        dependencies: {
          ...dependencies,
          next: pkgPaths.get('next'),
        },
        private: true,
      },
      null,
      2
    )
  )
  await execa('yarn', ['install'], {
    cwd: installDir,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      YARN_CACHE_FOLDER: path.join(installDir, '.yarn-cache'),
    },
  })

  await fs.remove(tmpRepoDir)
  return installDir
}

module.exports = {
  createNextInstall,
}
