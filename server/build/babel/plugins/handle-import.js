// Based on https://github.com/airbnb/babel-plugin-dynamic-import-webpack
// We've added support for SSR with this version
import template from 'babel-template'
import syntax from 'babel-plugin-syntax-dynamic-import'
import UUID from 'uuid'

const TYPE_IMPORT = 'Import'

const buildImport = (args) => (template(`
  (
    new Promise((resolve) => {
      if (process.pid) {
        eval('require.ensure = (deps, callback) => (callback(require))')
      }

      require.ensure([], (require) => {
        let m = require(SOURCE)
        m = m.default || m
        m.__webpackChunkName = '${args.name}.js'
        resolve(m);
      }, 'chunks/${args.name}.js');
    })
  )
`))

export default () => ({
  inherits: syntax,

  visitor: {
    CallExpression (path) {
      if (path.node.callee.type === TYPE_IMPORT) {
        const newImport = buildImport({
          name: UUID.v4()
        })({
          SOURCE: path.node.arguments
        })
        path.replaceWith(newImport)
      }
    }
  }
})
