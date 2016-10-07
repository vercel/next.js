import { dirname } from 'path'
import fs from 'mz/fs'
import mkdirp from 'mkdirp-then';
import { transformFile } from 'babel-core'
import preset2015 from 'babel-preset-es2015'
import presetReact from 'babel-preset-react'
import transformAsyncToGenerator from 'babel-plugin-transform-async-to-generator'
import transformClassProperties from 'babel-plugin-transform-class-properties'
import transformObjectRestSpread from 'babel-plugin-transform-object-rest-spread'
import transformRuntime from 'babel-plugin-transform-runtime'
import moduleAlias from 'babel-plugin-module-alias'

const babelRuntimePath = require.resolve('babel-runtime/package')
.replace(/[\\\/]package\.json$/, '');

const babelOptions = {
  presets: [preset2015, presetReact],
  plugins: [
    transformAsyncToGenerator,
    transformClassProperties,
    transformObjectRestSpread,
    transformRuntime,
    [
      moduleAlias,
      [
        { src: `npm:${babelRuntimePath}`, expose: 'babel-runtime' },
        { src: `npm:${require.resolve('react')}`, expose: 'react' },
        { src: `npm:${require.resolve('../../lib/link')}`, expose: 'next/link' },
        { src: `npm:${require.resolve('../../lib/css')}`, expose: 'next/css' },
        { src: `npm:${require.resolve('../../lib/head')}`, expose: 'next/head' }
      ]
    ]
  ],
  ast: false
}

export default async function transpile (src, dst) {
  const code = await new Promise((resolve, reject) => {
    transformFile(src, babelOptions, (err, result) => {
      if (err) return reject(err)
      resolve(result.code)
    })
  })

  await writeFile(dst, code)
}

async function writeFile (path, data) {
  await mkdirp(dirname(path))
  await fs.writeFile(path, data, { encoding: 'utf8', flag: 'w+' })
}
