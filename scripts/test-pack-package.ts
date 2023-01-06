const path = require('path')
const fs = require('fs-extra')
const os = require('os')
const execa = require('execa')
const { randomBytes } = require('crypto')

const main = async () => {
  const repoRoot = path.dirname(__dirname)
  const pkgsDir = path.join(repoRoot, 'packages')
  const currentPkgDirname = process.argv[2]

  const getPackedPkgPath = (pkgDirname: string) =>
    path.join(pkgsDir, pkgDirname, `packed-${pkgDirname}.tgz`)
  const getPackageJsonPath = (pkgDirname: string) =>
    path.join(pkgsDir, pkgDirname, `package.json`)

  const allPkgDirnames = await fs.readdir(pkgsDir)
  if (!allPkgDirnames.includes(currentPkgDirname)) {
    throw new Error(`Unknown package '${currentPkgDirname}'`)
  }

  const currentPkgDir = path.join(pkgsDir, currentPkgDirname)

  const tmpPkgPath = path.join(
    os.tmpdir(),
    `${currentPkgDirname}-${randomBytes(32).toString('hex')}`
  )

  const packageJson = await fs.readJson(getPackageJsonPath(currentPkgDirname))
  const dependencies = packageJson.dependencies

  if (dependencies) {
    await Promise.all(
      allPkgDirnames.map(async (depPkgDirname) => {
        const { name: depPkgName } = await fs.readJson(
          getPackageJsonPath(depPkgDirname)
        )
        if (depPkgName in dependencies) {
          dependencies[depPkgName] = getPackedPkgPath(depPkgDirname)
        }
      })
    )
  }

  try {
    await fs.copy(currentPkgDir, tmpPkgPath)
    await fs.writeJson(path.join(tmpPkgPath, 'package.json'), packageJson)
    execa.sync('yarn', ['pack', '-f', getPackedPkgPath(currentPkgDirname)], {
      cwd: tmpPkgPath,
    })
  } finally {
    fs.remove(tmpPkgPath).catch()
  }
}

main()
