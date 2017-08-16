// Based on https://github.com/airbnb/babel-plugin-dynamic-import-webpack
// We've added support for SSR with this version
import template from 'babel-template'
import syntax from 'babel-plugin-syntax-dynamic-import'
import { dirname, resolve, sep } from 'path'
import Crypto from 'crypto'

const TYPE_IMPORT = 'Import'

const buildImport = (args) => (template(`
  (
    typeof window === 'undefined' ?
      new (require('next/dynamic').SameLoopPromise)((resolve, reject) => {
        eval('require.ensure = function (deps, callback) { callback(require) }')
        require.ensure([], (require) => {
          let m = require(SOURCE)
          m.__webpackChunkName = '${args.name}.js'
          resolve(m);
        }, 'chunks/${args.name}.js');
      })
      :
      new (require('next/dynamic').SameLoopPromise)((resolve, reject) => {
        const weakId = require.resolveWeak(SOURCE)
        try {
          const weakModule = __webpack_require__(weakId)
          return resolve(weakModule)
        } catch (err) {}

        require.ensure([], (require) => {
          try {
            let m = require(SOURCE)
            resolve(m)
          } catch(error) {
            reject(error)
          }
        }, 'chunks/${args.name}.js');
      })
  )
`))

export function getModulePath (sourceFilename, moduleName) {
  // resolve only if it's a local module
  const modulePath = (moduleName[0] === '.')
    ? resolve(dirname(sourceFilename), moduleName) : moduleName

  const cleanedModulePath = modulePath
    .replace(/(index){0,1}\.js$/, '') // remove .js, index.js
    .replace(/[/\\]$/, '') // remove end slash

  return cleanedModulePath
}

export default () => ({
  inherits: syntax,

  visitor: {
    CallExpression (path, state) {
      if (path.node.callee.type === TYPE_IMPORT) {
        const moduleName = path.node.arguments[0].value
        const sourceFilename = state.file.opts.filename

        const modulePath = getModulePath(sourceFilename, moduleName)
        const modulePathHash = Crypto.createHash('md5').update(modulePath).digest('hex')

        const relativeModulePath = modulePath.replace(`${process.cwd()}${sep}`, '')
        const name = `${relativeModulePath.replace(/[^\w]/g, '_')}_${modulePathHash}`

        const newImport = buildImport({
          name
        })({
          SOURCE: path.node.arguments
        })
        path.replaceWith(newImport)
      }
    }
  }
})
