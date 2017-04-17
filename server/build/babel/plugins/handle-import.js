// Based on https://github.com/airbnb/babel-plugin-dynamic-import-webpack
// We've added support for SSR with this version
import template from 'babel-template'
import syntax from 'babel-plugin-syntax-dynamic-import'
import UUID from 'uuid'

const TYPE_IMPORT = 'Import'

const buildImport = (args) => (template(`
  (
    typeof window === 'undefined' ? 
      {
        then(cb) {
          eval('require.ensure = function (deps, callback) { callback(require) }')
          require.ensure([], (require) => {
            let m = require(SOURCE)
            m = m.default || m
            m.__webpackChunkName = '${args.name}.js'
            cb(m);
          }, 'chunks/${args.name}.js');
        },
        catch() {}
      } :
      {
        then(cb) {
          const weakId = require.resolveWeak(SOURCE)
          try {
            const weakModule = __webpack_require__(weakId)
            return cb(weakModule.default || weakModule)
          } catch (err) {}

          require.ensure([], (require) => {
            let m = require(SOURCE)
            m = m.default || m
            cb(m);
          }, 'chunks/${args.name}.js');
        },
        catch () {}
      }
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
