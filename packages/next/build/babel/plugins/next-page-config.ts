import { PluginObj } from '@babel/core'
import { NodePath } from '@babel/traverse'
import * as BabelTypes from '@babel/types'

interface PageConfig {
  amp?: boolean | 'hybrid'
}

function replacePath(path: any, t: typeof BabelTypes) {
  path.parentPath.replaceWith(
    t.program(
      [
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('config'),
            t.assignmentExpression(
              '=',
              t.identifier('no'), // this can't be empty but is required
              t.stringLiteral(`__NEXT_DROP_CLIENT_FILE__ ${Date.now()}`)
            )
          ),
        ]),
      ],
      []
    )
  )
}

export default function nextPageConfig({
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
        enter(path, state: any) {
          path.traverse(
            {
              ExportNamedDeclaration(
                path: NodePath<BabelTypes.ExportNamedDeclaration>,
                state: any
              ) {
                if (
                  state.replaced ||
                  !path.node.declaration ||
                  !(path.node.declaration as any).declarations
                )
                  return
                const { declarations } = path.node.declaration as any
                const config: PageConfig = {}

                for (const declaration of declarations) {
                  if (declaration.id.name !== 'config') continue

                  for (const prop of declaration.init.properties) {
                    const { name } = prop.key
                    if (name === 'amp') config.amp = prop.value.value
                  }
                }

                if (config.amp === true) {
                  replacePath(path, t)
                  state.replaced = true
                }
              },
              CallExpression(path: NodePath<BabelTypes.CallExpression>, state) {
                // @ts-ignore
                if (state.replaced || path.node.callee.name !== 'withAmp')
                  return

                if (path.node.arguments.length > 1) {
                  if (!t.isObjectExpression(path.node.arguments[1])) return
                  // @ts-ignore
                  const options: BabelTypes.ObjectExpression =
                    path.node.arguments[1]

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
                replacePath(path, t)
                state.replaced = true
              },
            },
            state
          )
        },
      },
    },
  }
}
