import { join } from 'path'
import { PluginObj } from '@babel/core'
import * as BabelTypes from '@babel/types'
import { getPluginId } from '../../plugins/collect-plugins'
import { PluginMetaData } from '../../plugins/collect-plugins'

type MiddlewareState = {
  opts?: {
    isApp: boolean
    plugins: PluginMetaData[]
  }
}

const clientInitId = '__CLIENT_INIT'
const documentMiddlewareId = '__DOC_MIDDLEWARE'

// config to parsing pageConfig for client bundles
export default function nextMiddlewarePlugin({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj {
  return {
    visitor: {
      Program: {
        enter(path, state: MiddlewareState) {
          if (!state.opts || !state.opts.plugins) {
            throw new Error('middleware plugins config is missing')
          }
          const { isApp, plugins } = state.opts
          let safeInsertIdx = 0

          for (let i = 0; i < path.node.body.length; i++) {
            const curNode = path.node.body[i]

            if (!t.isImport(curNode) && !t.isImportDeclaration(curNode)) {
              safeInsertIdx = i
              break
            }
          }
          const pluginIds: string[] = []
          const docMiddlewareRequires = []

          // require all of the plugins' middleware
          for (const plugin of plugins) {
            const pluginId = getPluginId(plugin.pkgName)
            const requirePath = join(
              plugin.directory,
              `middlewares/${isApp ? '_app' : '_document'}.middleware.js`
            )

            if (!isApp) {
              docMiddlewareRequires.push(
                t.callExpression(t.identifier('require'), [
                  t.stringLiteral(requirePath),
                ])
              )
              continue
            }

            path.node.body.splice(
              safeInsertIdx,
              0,
              t.variableDeclaration('var', [
                t.variableDeclarator(
                  t.identifier(pluginId),
                  t.assignmentExpression(
                    '=',
                    t.identifier(pluginId),
                    t.memberExpression(
                      t.callExpression(t.identifier('require'), [
                        t.stringLiteral(requirePath),
                      ]),
                      t.identifier('clientInit')
                    )
                  )
                ),
              ])
            )
            pluginIds.push(pluginId)
            safeInsertIdx++
          }

          if (!isApp) {
            path.node.body.splice(
              safeInsertIdx,
              0,
              t.variableDeclaration('var', [
                t.variableDeclarator(
                  t.identifier(documentMiddlewareId),
                  t.assignmentExpression(
                    '=',
                    t.identifier(documentMiddlewareId),
                    t.arrayExpression(docMiddlewareRequires)
                  )
                ),
              ])
            )
            safeInsertIdx++
          }
          // if no plugins with app middleware, nothing extra needed
          if (pluginIds.length === 0 && isApp) return
          const contextArg = t.identifier('middlewareCtx')
          let defaultExportIdx = -1

          let defaultExport: any = path.node.body.find((node, idx) => {
            if (t.isExportDefaultDeclaration(node)) {
              defaultExportIdx = idx
              return true
            }
          })

          if (defaultExport) {
            // it's a export default ... syntax
            defaultExport = defaultExport.declaration

            if (!t.isIdentifier(defaultExport)) {
              const prev = t.cloneDeep(defaultExport)
              path.node.body.splice(
                defaultExportIdx,
                1,
                prev,
                t.exportDefaultDeclaration(prev.id)
              )
              defaultExport = prev.id
            }
          } else {
            // look for a transpiled exports.default
            path.node.body.find(node => {
              if (t.isExpressionStatement(node) && node.expression) {
                const { left, right } = node.expression as any
                if (
                  t.isIdentifier(left.object) &&
                  left.object.name === 'exports' &&
                  left.property.name === 'default' &&
                  t.isIdentifier(right)
                ) {
                  defaultExport = right
                  return true
                }
              }
            })
          }

          if (!defaultExport) {
            throw new Error(
              `Failed to add middleware for ${isApp ? '_app' : '_document'}`
            )
          }

          // make sure to insert memberExpression after
          // the default export has been defined
          for (let i = 0; i < path.node.body.length; i++) {
            const curNode = path.node.body[i] as any
            if (curNode.id && curNode.id.name === defaultExport.name) {
              safeInsertIdx = i + 1
              break
            }
          }

          path.node.body.splice(
            safeInsertIdx,
            0,
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.memberExpression(
                  defaultExport as BabelTypes.Identifier,
                  t.identifier(isApp ? clientInitId : documentMiddlewareId)
                ),
                !isApp
                  ? t.identifier(documentMiddlewareId)
                  : t.functionExpression(
                      null,
                      [contextArg],
                      t.blockStatement(
                        pluginIds.map(pluginId => {
                          return t.expressionStatement(
                            t.callExpression(t.identifier(pluginId), [
                              contextArg,
                            ])
                          )
                        })
                      )
                    )
              )
            )
          )
        },
      },
    },
  }
}
