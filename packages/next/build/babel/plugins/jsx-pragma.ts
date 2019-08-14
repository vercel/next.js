import { PluginObj } from '@babel/core'
import { NodePath } from '@babel/traverse'
import * as BabelTypes from '@babel/types'

export default function({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj<any> {
  return {
    inherits: require('babel-plugin-syntax-jsx'),
    visitor: {
      JSXElement(path, state) {
        state.set('jsx', true)
      },

      // Fragment syntax is still JSX since it compiles to createElement(),
      // but JSXFragment is not a JSXElement
      JSXFragment(path, state) {
        state.set('jsx', true)
      },

      Program: {
        exit(path: NodePath<BabelTypes.Program>, state) {
          if (state.get('jsx')) {
            const pragma = t.identifier(state.opts.pragma)
            let importAs = pragma

            // var _jsx = _pragma.createElement;
            if (state.opts.property) {
              if (state.opts.importAs) {
                importAs = t.identifier(state.opts.importAs)
              } else {
                importAs = path.scope.generateUidIdentifier('pragma')
              }

              const mapping = t.variableDeclaration('var', [
                t.variableDeclarator(
                  pragma,
                  t.memberExpression(
                    importAs,
                    t.identifier(state.opts.property)
                  )
                ),
              ])

              // @ts-ignore
              path.unshiftContainer('body', mapping)
            }

            // if there's already a React in scope, use that instead of adding an import
            const existingBinding =
              state.opts.reuseImport !== false &&
              state.opts.importAs &&
              path.scope.hasBinding(state.opts.importAs)

            if (!existingBinding) {
              const importSpecifier = t.importDeclaration(
                [
                  state.opts.import
                    ? // import { $import as _pragma } from '$module'
                      t.importSpecifier(
                        importAs,
                        t.identifier(state.opts.import)
                      )
                    : state.opts.importNamespace
                    ? t.importNamespaceSpecifier(importAs)
                    : // import _pragma from '$module'
                      t.importDefaultSpecifier(importAs),
                ],
                t.stringLiteral(state.opts.module || 'react')
              )

              // @ts-ignore
              path.unshiftContainer('body', importSpecifier)
            }
          }
        },
      },
    },
  }
}
