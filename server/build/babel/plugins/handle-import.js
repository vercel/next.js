// Based on https://github.com/airbnb/babel-plugin-dynamic-import-webpack
// We've added support for SSR with this version
import template from 'babel-template'
import syntax from 'babel-plugin-syntax-dynamic-import'
import UUID from 'uuid'

const TYPE_IMPORT = 'Import'

const buildImport = (args) => (template(`
  (
    typeof window === 'undefined' ?
      new (require('next/dynamic').SameLoopPromise)((resolve, reject) => {
        eval('require.ensure = function (deps, callback) { callback(require) }')
        require.ensure([], (require) => {
          let m = require(SOURCE)
          m = m.default || m
          m.__webpackChunkName = '${args.name}.js'
          resolve(m);
        }, 'chunks/${args.name}.js');
      })
      :
      new (require('next/dynamic').SameLoopPromise)((resolve, reject) => {
        const weakId = require.resolveWeak(SOURCE)
        try {
          const weakModule = __webpack_require__(weakId)
          return resolve(weakModule.default || weakModule)
        } catch (err) {}

        require.ensure([], (require) => {
          try {
            let m = require(SOURCE)
            m = m.default || m
            resolve(m)
          } catch(error) {
            reject(error)
          }
        }, 'chunks/${args.name}.js');
      })
  )
`))

export default () => ({
  inherits: syntax,

  visitor: {
    CallExpression (path) {
      if (path.node.callee.type === TYPE_IMPORT) {
        const moduleName = path.node.arguments[0].value
        const name = `${moduleName.replace(/[^\w]/g, '-')}-${UUID.v4()}`
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
