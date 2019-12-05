import { PluginObj } from '@babel/core'
import * as BabelTypes from '@babel/types'

const pageComponentVar = '__NEXT_COMP'
const prerenderId = '__NEXT_SPR'

export const EXPORT_NAME_GET_STATIC_PROPS = 'unstable_getStaticProps'
export const EXPORT_NAME_GET_STATIC_PATHS = 'unstable_getStaticPaths'

export default function nextTransformSsg({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj<{
  isPrerender: boolean
  done: boolean
}> {
  return {
    visitor: {
      Program: {
        enter(path, state) {
          path.traverse({
            // export function unstable_getStaticPaths() {}
            ExportNamedDeclaration(path) {
              const declaration = path.node.declaration
              if (!declaration) {
                return
              }

              if (declaration.type === 'VariableDeclaration') {
                return
              }

              const name =
                declaration.type === 'FunctionDeclaration'
                  ? declaration.id && declaration.id.name
                  : null

              if (name == null) {
                throw new Error(`invariant: null function declaration`)
              }

              if (
                name === EXPORT_NAME_GET_STATIC_PROPS ||
                name === EXPORT_NAME_GET_STATIC_PATHS
              ) {
                path.remove()
                state.isPrerender = true
              }
            },
            // export { unstable_getStaticPaths } from '.'
            ExportSpecifier(path) {
              const name = path.node.exported.name
              if (
                name === EXPORT_NAME_GET_STATIC_PROPS ||
                name === EXPORT_NAME_GET_STATIC_PATHS
              ) {
                path.remove()
                state.isPrerender = true

                if (path.parent.type !== 'ExportNamedDeclaration') {
                  throw new Error(
                    `invariant: ${path.type} has unknown parent: ${path.parent.type}`
                  )
                }

                if (path.parent.specifiers.length === 0) {
                  path.parentPath.remove()
                }
              }
            },
          })
        },
        exit(path, state) {
          if (state.isPrerender) {
            ;(path.scope as any).crawl()
          }

          path.traverse({
            ExportDefaultDeclaration(path) {
              if (!state.isPrerender || state.done) {
                return
              }

              state.done = true

              const prev = path.node.declaration
              if (prev.type.endsWith('Declaration')) {
                prev.type = prev.type.replace(
                  /Declaration$/,
                  'Expression'
                ) as any
              }

              // @ts-ignore invalid return type
              const [pageCompPath] = path.replaceWithMultiple([
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier(pageComponentVar),
                    prev as any
                  ),
                ]),
                t.assignmentExpression(
                  '=',
                  t.memberExpression(
                    t.identifier(pageComponentVar),
                    t.identifier(prerenderId)
                  ),
                  t.booleanLiteral(true)
                ),
                t.exportDefaultDeclaration(t.identifier(pageComponentVar)),
              ])
              path.scope.registerDeclaration(pageCompPath)
            },
          })
        },
      },
    },
  }
}
