import { join } from 'path'
import { PluginObj } from '@babel/core'
import * as BabelTypes from '@babel/types'
import { PluginMetaData } from '../../plugins/collect-plugins'

type MiddlewareState = {
  opts?: {
    plugins: PluginMetaData[]
  }
}

const clientInitId = '__CLIENT_INIT'

// clean package name so it can be used as variable
const getPluginId = (pkg: string): string => {
  pkg = pkg.replace(/\W/g, '')

  if (pkg.match(/^[0-9]/)) {
    pkg = `_${pkg}`
  }
  return pkg
}

// config to parsing pageConfig for client bundles
export default function nextAppMiddleware({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj {
  return {
    visitor: {
      Program: {
        enter(path, state: MiddlewareState) {
          // TODO: bail out if no plugins with App Middleware
          if (!state.opts || !state.opts.plugins) {
            throw new Error('_app middleware plugins config is missing')
          }
          const { plugins } = state.opts
          let safeInsertIdx = 0

          for (let i = 0; i < path.node.body.length; i++) {
            const curNode = path.node.body[i]

            if (!t.isImport(curNode) && !t.isImportDeclaration(curNode)) {
              safeInsertIdx = i
              break
            }
          }
          const pluginIds: string[] = []

          // require all of the plugins' app middleware
          for (const plugin of plugins) {
            const pluginId = getPluginId(plugin.pkgName)
            const requirePath = join(
              plugin.directory,
              'middlewares/_app.middleware.js'
            )

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

          // if no plugins with app middleware, nothing extra needed
          if (pluginIds.length === 0) return

          const contextArg = t.identifier('middlewareCtx')

          // Add __CLIENT_INIT static method that calls middleware
          path.traverse(
            {
              ClassDeclaration(path, state) {
                path.node.body.body.push(
                  t.classMethod(
                    'method',
                    t.identifier(clientInitId),
                    [contextArg],
                    t.blockStatement(
                      pluginIds.map(pluginId => {
                        return t.expressionStatement(
                          t.callExpression(t.identifier(pluginId), [contextArg])
                        )
                      })
                    ),
                    undefined,
                    true
                  )
                )
              },
            },
            state
          )
        },
      },
    },
  }
}
