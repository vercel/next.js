import { dirname, resolve, join } from 'path'
import { existsSync } from 'fs'
import pkgUp from 'pkg-up'

export default async function findClosestPath (dir, fileOrDir) {
  const pkgJsonPath = await pkgUp()
  const closetsPkgJsonDir = resolve(dirname(pkgJsonPath))

  let lookupDir = resolve(dir)
  while (true) {
    const babelrcRcPath = join(lookupDir, fileOrDir)
    const hasBabelRc = existsSync(babelrcRcPath)
    if (hasBabelRc) return babelrcRcPath
    if (lookupDir === closetsPkgJsonDir) return null

    lookupDir = join(lookupDir, '../')
  }
}
