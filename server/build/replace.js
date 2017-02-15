import { rename } from 'mz/fs'
import { join } from 'path'

export default async function replaceCurrentBuild (dir, buildDir) {
  const _dir = join(dir, '.next')
  const _buildDir = join(buildDir, '.next')
  const oldDir = join(buildDir, '.next.old')

  try {
    await rename(_dir, oldDir)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  await rename(_buildDir, _dir)
  return oldDir
}
