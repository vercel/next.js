import { dirname, resolve, join, sep } from 'path'
import { existsSync } from 'fs'
import pkgUp from 'pkg-up'

export default async function findClosestPath (dir, fileOrDir) {
  let lookupDir = resolve(dir)
  const pkgJsonPath = await pkgUp(lookupDir)
  const closetsPkgJsonDir = resolve(dirname(pkgJsonPath))

  while (true) {
    const babelrcRcPath = join(lookupDir, fileOrDir)
    const hasBabelRc = existsSync(babelrcRcPath)
    if (hasBabelRc) return babelrcRcPath
    if (normalize(lookupDir) === normalize(closetsPkgJsonDir)) return null

    lookupDir = join(lookupDir, '../')
  }
}

function normalize (p) {
  const check = new RegExp(`${sep}$`)
  return p.replace(check, '')
}
