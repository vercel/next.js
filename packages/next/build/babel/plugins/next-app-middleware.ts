import { PluginObj } from '@babel/core'
import * as BabelTypes from '@babel/types'

type MiddlewareState = {
  importsAdded?: boolean
}

const middlewarExportId = '__MIDDLEWARE'

// clean package name so it can be used as variable
const getPluginId = (pkg: string): string => {
  return pkg.replace(/(@|-)/g, '')
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

          // insert __MIDDLEWARE export function
          path.insertAfter(
            t.exportNamedDeclaration(
              t.functionDeclaration(
                t.identifier(middlewarExportId),
                [
                  // add parameter for MiddlewareCtx
                ],
                t.blockStatement([
                  // add calling middlewares here
                  t.returnStatement(t.nullLiteral()),
                ])
              ),
              [t.exportNamespaceSpecifier(t.identifier(middlewarExportId))]
            )
          )

          path.traverse(
            {
              ImportDeclaration(path, state) {
                if (state.importsAdded) return

                // TODO: get this from state.config
                const plugins = ['next-plugin-google-analytics']

                for (const plugin of plugins) {
                  // TODO: need to enable transpiling the imported plugins
                  // import the plugin
                  path.insertAfter(
                    t.importDeclaration(
                      [
                        t.importNamespaceSpecifier(
                          t.identifier(getPluginId(plugin))
                        ),
                      ],
                      t.stringLiteral(`${plugin}/middlewares/_app.middleware`)
                    )
                  )
                }

                state.importsAdded = true
              },
            },
            state
          )
        },
      },
    },
  }
}
