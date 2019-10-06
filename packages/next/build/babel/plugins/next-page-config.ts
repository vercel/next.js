import { PluginObj } from '@babel/core'
import { NodePath } from '@babel/traverse'
import * as BabelTypes from '@babel/types'
import { PageConfig } from '../../../types'

export const dropBundleIdentifier = '__NEXT_DROP_CLIENT_FILE__'
export const sprStatus = { used: false }

const configKeys = new Set(['amp'])
const pageComponentVar = '__NEXT_COMP'
// this value can't be optimized by terser so the shorter the better
const prerenderId = '__NEXT_SPR'
const EXPORT_NAME_GET_STATIC_PROPS = 'unstable_getStaticProps'
const EXPORT_NAME_GET_STATIC_PARAMS = 'unstable_getStaticParams'

// replace program path with just a variable with the drop identifier
function replaceBundle(path: any, t: typeof BabelTypes) {
  path.parentPath.replaceWith(
    t.program(
      [
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('config'),
            t.assignmentExpression(
              '=',
              t.identifier(dropBundleIdentifier),
              t.stringLiteral(`${dropBundleIdentifier} ${Date.now()}`)
            )
          ),
        ]),
      ],
      []
    )
  )
}

interface ConfigState {
  isPrerender?: boolean
  bundleDropped?: boolean
}

// config to parsing pageConfig for client bundles
export default function nextPageConfig({
  types: t,
}: {
  types: typeof BabelTypes
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
                // Skip if the file will be dropped
                if (state.bundleDropped) {
                  return
                }

                // Bail out of `export { a, b, c };` case.
                // We should probably support this.
                if (!path.node.declaration) {
                  return
                }

                const { declarations, id } = path.node.declaration as any

                // drop SSR Exports for client bundles
                if (
                  id &&
                  (id.name === EXPORT_NAME_GET_STATIC_PROPS ||
                    id.name === EXPORT_NAME_GET_STATIC_PARAMS)
                ) {
                  if (id.name === EXPORT_NAME_GET_STATIC_PROPS) {
                    state.isPrerender = true
                    sprStatus.used = true
                  }
                  path.remove()
                  return
                }

                if (!declarations) {
                  return
                }

                const config: PageConfig = {}
                for (let dIndex = 0; dIndex < declarations.length; ++dIndex) {
                  const declaration = declarations[dIndex]

                  if (declaration.id.name !== 'config') {
                    continue
                  }

                  if (declaration.init.type !== 'ObjectExpression') {
                    const pageName =
                      (state.filename || '').split(state.cwd || '').pop() ||
                      'unknown'

                    throw new Error(
                      `Invalid page config export found. Expected object but got ${
                        declaration.init.type
                      } in file ${pageName}. See: https://err.sh/zeit/next.js/invalid-page-config`
                    )
                  }

                  for (const prop of declaration.init.properties) {
                    const { name } = prop.key
                    if (configKeys.has(name)) {
                      // @ts-ignore
                      config[name] = prop.value.value
                    }
                  }

                  declarations.splice(dIndex, 1)
                  if (declarations.length === 0) {
                    path.remove()
                  }
                }

                if (config.amp === true) {
                  replaceBundle(path, t)
                  state.bundleDropped = true
                  return
                }
              },
            },
            state
          )
        },
      },
      ExportDefaultDeclaration(path, state: ConfigState) {
        if (!state.isPrerender) {
          return
        }
        const prev = t.cloneDeep(path.node.declaration)

        // workaround to allow assigning a ClassDeclaration to a variable
        // babel throws error without
        if (prev.type.endsWith('Declaration')) {
          prev.type = prev.type.replace(/Declaration$/, 'Expression') as any
        }

        path.insertBefore([
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
        ])

        path.node.declaration = t.identifier(pageComponentVar)
      },
    },
  }
}
