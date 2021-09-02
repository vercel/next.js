const os = require('os')
const path = require('path')
const execa = require('execa')
const fs = require('fs-extra')
const { linkPackages } =
  require('../../.github/actions/next-stats-action/src/prepare/repo-setup')()

export async function createNextInstall(dependencies) {
  const tmpDir = await fs.realpath(process.env.NEXT_TEST_DIR || os.tmpdir())
  const origRepoDir = path.join(__dirname, '../../')
  const installDir = path.join(tmpDir, `next-install-${Date.now()}`)
  const tmpRepoDir = path.join(tmpDir, `next-repo-${Date.now()}`)

  await fs.copy(origRepoDir, tmpRepoDir, {
    filter: (item) => {
      return !item.includes('node_modules')
    },
  })
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
