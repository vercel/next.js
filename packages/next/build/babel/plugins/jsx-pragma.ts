import { NodePath, PluginObj } from '@babel/core'
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

            // if there's already a React in scope, use that instead of adding an import
            const existingBinding =
              state.opts.reuseImport !== false &&
              state.opts.importAs &&
              path.scope.getBinding(state.opts.importAs)

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

              // if the React binding came from a require('react'),
              // make sure that our usage comes after it.
              let newPath
              if (
                existingBinding &&
                t.isVariableDeclarator(existingBinding.path.node) &&
                t.isCallExpression(existingBinding.path.node.init) &&
                t.isIdentifier(existingBinding.path.node.init.callee) &&
                existingBinding.path.node.init.callee.name === 'require'
              ) {
                ;[newPath] = existingBinding.path.parentPath.insertAfter(
                  mapping
                )
              } else {
                // @ts-ignore
                ;[newPath] = path.unshiftContainer('body', mapping)
              }

              for (const declar of newPath.get('declarations')) {
                path.scope.registerBinding(newPath.node.kind, declar)
              }
            }

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
              const [newPath] = path.unshiftContainer('body', importSpecifier)
              for (const specifier of newPath.get('specifiers')) {
                path.scope.registerBinding('module', specifier)
              }
            }
          }
        },
      },
    },
  }
}
