const path = require('path')
const fs = require('fs')
const { existsSync } = require('fs')

/**
 * Discovers the packed tarballs produced by `pack-for-isolated-tests` in the
 * given repository checkout. Returns a Map from package name to tarball path.
 */
async function linkPackages({ repoDir }) {
  /** @type {Map<string, string>} */
  const pkgPaths = new Map()

  let packageFolders
  try {
    packageFolders = await fs.promises.readdir(path.join(repoDir, 'packages'))
  } catch (err) {
    if (err.code === 'ENOENT') {
      require('console').log('no packages to link')
      return pkgPaths
    }
    throw err
  }

  for (const packageFolder of packageFolders) {
    const packagePath = path.join(repoDir, 'packages', packageFolder)
    const tarballPath = path.join(packagePath, 'packed.tgz')
    const packageJsonPath = path.join(packagePath, 'package.json')

    if (!existsSync(packageJsonPath) || !existsSync(tarballPath)) {
      continue
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    pkgPaths.set(packageJson.name, tarballPath)
  }

  require('console').log(
    `Found ${pkgPaths.size} packed tarballs:`,
    Array.from(pkgPaths.keys()).join(', ')
  )

  return pkgPaths
}

module.exports = { linkPackages }
