import { NodePath, PluginObj } from '@babel/core'
import * as BabelTypes from '@babel/types'

export default function(): PluginObj<any> {
  return {
    name: 'dangerously-remove-unused-imports',
    visitor: {
      Program: {
        exit(path: NodePath<BabelTypes.Program>) {
          Object.entries(path.scope.bindings).forEach(([k, v]) => {
            if (v.referenced || v.kind !== 'module') return

            if (
              !(
                v.path.type === 'ImportDefaultSpecifier' ||
                v.path.type === 'ImportSpecifier'
              ) ||
              !(v.path.parent.type === 'ImportDeclaration')
            ) {
              throw new Error(
                `invariant: unknown import binding: ${v.path.type} / parent: ${v.path.parent.type}`
              )
            }

            if (v.path.parent.specifiers.length === 1) {
              v.path.parentPath.remove()
            } else {
              v.path.remove()
            }
          })
        },
      },
    },
  }
}
