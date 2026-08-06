import { types as BabelTypes } from 'next/dist/compiled/babel/core'
import type {
  PluginObj,
  PluginPass,
  Visitor,
  NodePath,
} from 'next/dist/compiled/babel/core'

const CONFIG_KEY = 'config'

function errorMessage(state: any, details: string): string {
  const pageName =
    (state.filename || '').split(state.cwd || '').pop() || 'unknown'
  return `Invalid page config export found. ${details} in file ${pageName}. See: https://nextjs.org/docs/messages/invalid-page-config`
}

interface ConfigState extends PluginPass {
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
        enter(path, state) {
          path.traverse(
            {
              ExportDeclaration(exportPath, exportState) {
                if (
                  BabelTypes.isExportNamedDeclaration(exportPath.node) &&
                  exportPath.node.specifiers?.some((specifier) => {
                    return (
                      (t.isIdentifier(specifier.exported)
                        ? specifier.exported.name
                        : specifier.exported.value) === CONFIG_KEY
                    )
                  }) &&
                  BabelTypes.isStringLiteral(
                    (exportPath.node as BabelTypes.ExportNamedDeclaration)
                      .source
                  )
                ) {
                  throw new Error(
                    errorMessage(
                      exportState,
                      'Expected object but got export from'
                    )
                  )
                }
              },
              ExportNamedDeclaration(
                exportPath: NodePath<BabelTypes.ExportNamedDeclaration>,
                exportState: any
              ) {
                if (
                  exportState.bundleDropped ||
                  (!exportPath.node.declaration &&
                    exportPath.node.specifiers.length === 0)
                ) {
                  return
                }

                const declarations: BabelTypes.VariableDeclarator[] = [
                  ...((
                    exportPath.node
                      .declaration as BabelTypes.VariableDeclaration
                  )?.declarations || []),
                  exportPath.scope.getBinding(CONFIG_KEY)?.path
                    .node as BabelTypes.VariableDeclarator,
                ].filter(Boolean)

                for (const specifier of exportPath.node.specifiers) {
                  if (
                    (t.isIdentifier(specifier.exported)
                      ? specifier.exported.name
                      : specifier.exported.value) === CONFIG_KEY
                  ) {
                    // export {} from 'somewhere'
                    if (BabelTypes.isStringLiteral(exportPath.node.source)) {
                      throw new Error(
                        errorMessage(
                          exportState,
                          `Expected object but got import`
                        )
                      )
                      // import hello from 'world'
                      // export { hello as config }
                    } else if (
                      BabelTypes.isIdentifier(
                        (specifier as BabelTypes.ExportSpecifier).local
                      )
                    ) {
                      if (
                        BabelTypes.isImportSpecifier(
                          exportPath.scope.getBinding(
                            (specifier as BabelTypes.ExportSpecifier).local.name
                          )?.path.node
                        )
                      ) {
                        throw new Error(
                          errorMessage(
                            exportState,
                            `Expected object but got import`
                          )
                        )
                      }
                    }
                  }
                }

                for (const declaration of declarations) {
                  if (
                    !BabelTypes.isIdentifier(declaration.id, {
                      name: CONFIG_KEY,
                    })
                  ) {
                    continue
                  }

                  let { init } = declaration
                  if (BabelTypes.isTSAsExpression(init)) {
                    init = init.expression
                  }

                  if (!BabelTypes.isObjectExpression(init)) {
                    const got = init ? init.type : 'undefined'
                    throw new Error(
                      errorMessage(
                        exportState,
                        `Expected object but got ${got}`
                      )
                    )
                  }

                  for (const prop of init.properties) {
                    if (BabelTypes.isSpreadElement(prop)) {
                      throw new Error(
                        errorMessage(
                          exportState,
                          `Property spread is not allowed`
                        )
                      )
                    }
                  }
                }
              },
            },
            state
          )
        },
      },
    } as Visitor<ConfigState>,
  }
}
