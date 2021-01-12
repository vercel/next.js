import execa from 'execa'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const packagesDir = path.join(__dirname, '..', '..', 'packages')

export const runYarn = (cwd, ...args) => execa('yarn', [...args], { cwd })

export async function usingTempDir(fn) {
  const folder = path.join(os.tmpdir(), Math.random().toString(36).substring(2))
  await fs.mkdirp(folder)
  try {
    return await fn(folder)
  } finally {
    await fs.remove(folder)
  }
}

/**
 * Using 'npm pack', create a tarball of the given package in
 * directory `pkg` and write it to `cwd`.
 *
 * `pkg` is relative to the monorepo 'packages/' directory.
 *
 * Return the absolute path to the tarball.
 */
export async function pack(cwd, pkg) {
  const pkgDir = path.join(packagesDir, pkg)
  const { stdout } = await execa(
    'npm',
    ['pack', '--ignore-scripts', path.join(packagesDir, pkg)],
    { cwd }
  )

  const tarballFilename = stdout.match(/.*\.tgz/)[0]

  if (!tarballFilename) {
    throw new Error(
      `npm failed to pack "next" package tarball in directory ${pkgDir}.`
    )
  }

  return path.join(cwd, tarballFilename)
}
