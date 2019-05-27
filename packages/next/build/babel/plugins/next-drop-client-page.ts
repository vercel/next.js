import { PluginObj } from '@babel/core'
import { NodePath } from '@babel/traverse'
import * as BabelTypes from '@babel/types'

let idx = 0

export default function({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj<{
  insertedDrop?: boolean
  hasAmp?: boolean
}> {
  return {
    visitor: {
      Program: {
        enter(path, state) {
          path.traverse(
            {
              ImportDeclaration(
                path: NodePath<BabelTypes.ImportDeclaration>,
                state
              ) {
                const source = path.node.source.value
                if (source !== 'next/amp') return
                state.hasAmp = true
              },
            },
            state
          )
        },
      },
      CallExpression(path: NodePath<BabelTypes.CallExpression>, state) {
        if (!state.hasAmp || state.insertedDrop) return
        // @ts-ignore
        if (path.node.callee.name !== 'withAmp') return

        if (path.node.arguments.length > 1) {
          if (!t.isObjectExpression(path.node.arguments[1])) return
          // @ts-ignore
          const options: BabelTypes.ObjectExpression = path.node.arguments[1]

          // make sure it isn't a hybrid page e.g. hybrid: true
          if (
            options.properties.some(
              (prop: any): boolean => {
                if (!t.isObjectProperty(prop)) return false
                if (
                  prop.key.name !== 'hybrid' ||
                  !t.isBooleanLiteral(prop.value)
                ) {
                  return false
                }
                // found hybrid: true
                return Boolean(prop.value.value)
              }
            )
          ) {
            return
          }
        }
        // use random number and an increment to make sure HMR still updates
        idx++
        state.insertedDrop = true
        path.replaceWith(
          t.expressionStatement(
            t.stringLiteral(
              `throw new Error('__NEXT_DROP_CLIENT_FILE__' + ${Math.random() +
                idx})`
            )
          )
        )
      },
    },
  }
}
