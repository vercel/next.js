import { NodePath, PluginObj } from '@babel/core'
import * as BabelTypes from '@babel/types'
import { PageConfig } from '../../../types'

const configKeys = new Set(['amp'])
const STRING_LITERAL_DROP_BUNDLE = '__NEXT_DROP_CLIENT_FILE__'

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
              t.identifier(STRING_LITERAL_DROP_BUNDLE),
              t.stringLiteral(`${STRING_LITERAL_DROP_BUNDLE} ${Date.now()}`)
            )
          ),
        ]),
      ],
      []
    )
  )
}

interface ConfigState {
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
                if (state.bundleDropped || !path.node.declaration) {
                  return
                }

                const { declarations } = path.node.declaration as any
                const config: PageConfig = {}

                if (!declarations) {
                  return
                }
                for (const declaration of declarations) {
                  if (declaration.id.name !== 'config') {
                    continue
                  }

                  if (declaration.init.type !== 'ObjectExpression') {
                    const pageName =
                      (state.filename || '').split(state.cwd || '').pop() ||
                      'unknown'

                    throw new Error(
                      `Invalid page config export found. Expected object but got ${declaration.init.type} in file ${pageName}. See: https://err.sh/zeit/next.js/invalid-page-config`
                    )
                  }

                  for (const prop of declaration.init.properties) {
                    const { name } = prop.key
                    if (configKeys.has(name)) {
                      // @ts-ignore
                      config[name] = prop.value.value
                    }
                  }
                }

                if (config.amp === true) {
                  if (!state.file?.opts?.caller.isDev) {
                    // don't replace bundle in development so HMR can track
                    // dependencies and trigger reload when they are changed
                    replaceBundle(path, t)
                  }
                  state.bundleDropped = true
                  return
                }
              },
            },
            state
          )
        },
      },
    },
  }
}
