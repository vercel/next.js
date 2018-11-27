// Based on https://github.com/airbnb/babel-plugin-dynamic-import-webpack
// We've added support for SSR with this version
import template from '@babel/template'
import syntax from '@babel/plugin-syntax-dynamic-import'
import { dirname, relative, resolve } from 'path'

const TYPE_IMPORT = 'Import'

const buildImport = (args) => (template(`
  (
      new (require('next/same-loop-promise').default)((resolve, reject) => {
        require.ensure(SOURCE, (require) => {
          try {
            let m = require(SOURCE)
            resolve(m)
          } catch(error) {
            reject(error)
          }
        }, reject, 'chunks/${args.name}');
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
        const { opts } = path.hub.file

        const arg = path.node.arguments[0]
        const chunknameComment = arg.leadingComments && arg.leadingComments.map(({ value }) => value.trim()).filter((value) => /webpackChunkName:/.test(value))[0]
        const moduleRequest = arg.value

        let chunkName
        if (chunknameComment) {
          chunkName = JSON.parse(chunknameComment.replace(/webpackChunkName:\s*/, ''))
        } else {
          const currentDir = dirname(opts.filename)
          const modulePath = resolve(currentDir, moduleRequest)
          chunkName = relative(opts.sourceRoot || process.cwd(), modulePath).replace(/[^\w]/g, '-')
        }

        const newImport = buildImport({
          name: chunkName
        })({
          SOURCE: path.node.arguments
        })
        path.replaceWith(newImport)
      }
    }
  }
})
