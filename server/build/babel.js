import { resolve, join, dirname } from 'path'
import { readFile, writeFile } from 'mz/fs'
import { transform } from 'babel-core'
import chokidar from 'chokidar'
import mkdirp from 'mkdirp-then'

const babelRuntimePath = require.resolve('babel-runtime/package')
.replace(/[\\/]package\.json$/, '')

export default babel

async function babel (dir, { dev = false } = {}) {
  dir = resolve(dir)

  let src
  try {
    src = await readFile(join(dir, 'pages', '_document.js'), 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      src = await readFile(join(__dirname, '..', '..', 'pages', '_document.js'), 'utf8')
    } else {
      throw err
    }
  }

  const { code } = transform(src, {
    babelrc: false,
    sourceMaps: dev ? 'inline' : false,
    presets: ['es2015', 'react'],
    plugins: [
      require.resolve('babel-plugin-react-require'),
      require.resolve('babel-plugin-transform-async-to-generator'),
      require.resolve('babel-plugin-transform-object-rest-spread'),
      require.resolve('babel-plugin-transform-class-properties'),
      require.resolve('babel-plugin-transform-runtime'),
      [
        require.resolve('babel-plugin-module-resolver'),
        {
          alias: {
            'babel-runtime': babelRuntimePath,
            react: require.resolve('react'),
            'next/link': require.resolve('../../lib/link'),
            'next/css': require.resolve('../../lib/css'),
            'next/head': require.resolve('../../lib/head'),
            'next/document': require.resolve('../../server/document')
          }
        }
      ]
    ]
  })

  const file = join(dir, '.next', 'dist', 'pages', '_document.js')
  await mkdirp(dirname(file))
  await writeFile(file, code)
}

export function watch (dir) {
  return chokidar.watch('pages/_document.js', {
    cwd: dir,
    ignoreInitial: true
  })
}
