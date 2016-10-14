import { resolve } from 'path'
import glob from 'glob-promise'
import transpile from './transpile'
import bundle from './bundle'

export default async function build (dir) {
  const dstDir = resolve(dir, '.next')
  const templateDir = resolve(__dirname, '..', '..', 'pages')

  // create `.next/pages/_error.js`
  // which may be overwriten by the user sciprt, `pages/_error.js`
  const templatPaths = await glob('**/*.js', { cwd: templateDir })
  await Promise.all(templatPaths.map(async (p) => {
    await transpile(resolve(templateDir, p), resolve(dstDir, 'pages', p))
  }))

  const paths = await glob('**/*.js', { cwd: dir, ignore: 'node_modules/**' })
  await Promise.all(paths.map(async (p) => {
    await transpile(resolve(dir, p), resolve(dstDir, p))
  }))

  const pagePaths = await glob('pages/**/*.js', { cwd: dstDir })
  await Promise.all(pagePaths.map(async (p) => {
    await bundle(resolve(dstDir, p), resolve(dstDir, '_bundles', p))
  }))
}
