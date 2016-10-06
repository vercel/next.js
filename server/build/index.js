import { resolve } from 'path'
import glob from 'glob-promise'
import transpile from './transpile'
import bundle from './bundle'

export default async function build (dir) {
  const dstDir = resolve(dir, '.next')

  const paths = await glob('**/*.js', { cwd: dir, ignore: 'node_modules/**' })
  await Promise.all(paths.map(async (p) => {
    await transpile(resolve(dir, p), resolve(dstDir, p))
  }))

  const pagePaths = await glob('pages/**/*.js', { cwd: dstDir })
  await Promise.all(pagePaths.map(async (p) => {
    await bundle(resolve(dstDir, p), resolve(dstDir, '_bundles', p))
  }))
}
