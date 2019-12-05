import { NodePath, PluginObj } from '@babel/core'
import * as BabelTypes from '@babel/types'

const pageComponentVar = '__NEXT_COMP'
const prerenderId = '__NEXT_SPR'
export const EXPORT_NAME_GET_STATIC_PROPS = 'unstable_getStaticProps'
const EXPORT_NAME_GET_STATIC_PATHS = 'unstable_getStaticPaths'

interface ConfigState {
  isPrerender?: boolean
  defaultExportUpdated?: boolean
}

export default function nextSsgTransform({
  types: t,
  traverse,
}: {
  types: typeof BabelTypes
  traverse: any
}): PluginObj {
  return {
    visitor: {
      Program: {
        enter(path, state: ConfigState) {
          path.traverse(
            {
              ExportNamedDeclaration(
                path: NodePath<BabelTypes.ExportNamedDeclaration>,
                state: any
              ) {
                if (
                  state.bundleDropped ||
                  !(path.node.declaration || path.node.specifiers.length)
                ) {
                  return
                }

                if (path.node.specifiers.length) {
                  const { specifiers } = path.node
                  specifiers.forEach(specifier => {
                    if (specifier.type !== 'ExportSpecifier') {
                      return
                    }

                    if (
                      specifier.exported.name ===
                        EXPORT_NAME_GET_STATIC_PROPS ||
                      specifier.exported.name === EXPORT_NAME_GET_STATIC_PATHS
                    ) {
                      if (
                        specifier.exported.name === EXPORT_NAME_GET_STATIC_PROPS
                      ) {
                        state.isPrerender = true
                      }
                      path.node.specifiers = path.node.specifiers.filter(
                        s => s !== specifier
                      )
                      return
                    }
                  })
                  if (path.node.specifiers.length === 0) {
                    path.remove()
                  }
                  return
                }

                const { id } = path.node.declaration as any
                if (
                  id &&
                  (id.name === EXPORT_NAME_GET_STATIC_PROPS ||
                    id.name === EXPORT_NAME_GET_STATIC_PATHS)
                ) {
                  if (id.name === EXPORT_NAME_GET_STATIC_PROPS) {
                    state.isPrerender = true
                  }
                  path.remove()
                  return
                }
              },
            },
            state
          )

          if (state.isPrerender) {
            // After we delete a bunch of code, we need to re-compute the scope.
            // This is necessary for later code elimination.
            traverse.cache.clear()
            ;(path.scope as any).crawl()
          }
        },
      },
      ExportDefaultDeclaration(path, state: ConfigState) {
        if (!state.isPrerender || state.defaultExportUpdated) {
          return
        }
        const prev = t.cloneDeep(path.node.declaration)

        // workaround to allow assigning a ClassDeclaration to a variable
        // babel throws error without
        if (prev.type.endsWith('Declaration')) {
          prev.type = prev.type.replace(/Declaration$/, 'Expression') as any
        }

        // @ts-ignore invalid return type
        const [pageCompPath] = path.replaceWithMultiple([
          t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(pageComponentVar), prev as any),
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
        state.defaultExportUpdated = true
      },
    },
  }
}
