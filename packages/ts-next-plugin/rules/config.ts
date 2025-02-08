// This module provides intellisense for page and layout's exported configs.

import { isPositionInsideNode, removeStringQuotes } from '../utils'
import {
  NEXT_TS_ERRORS,
  ALLOWED_EXPORTS,
  LEGACY_CONFIG_EXPORT,
  API_DOCS,
} from '../constant'
import type tsModule from 'typescript/lib/tsserverlibrary'
import type { TSNextPlugin } from '../TSNextPlugin'

function getAPIDescription(api: keyof typeof API_DOCS): string {
  const apiDoc = API_DOCS[api]
  if ('options' in apiDoc) {
    const optionsDescription = Object.entries(apiDoc.options || {})
      .map(([key, value]) => `- \`${key}\`: ${value}`)
      .join('\n')

    return `${apiDoc.description}\n\n${optionsDescription}`
  }
  return apiDoc.description
}

export const config = (tsNextPlugin: TSNextPlugin) => ({
  visitEntryConfig(
    fileName: string,
    position: number,
    callback: (entryConfig: string, value: tsModule.VariableDeclaration) => void
  ) {
    const source = tsNextPlugin.getSource(fileName)
    if (source) {
      tsNextPlugin.ts.forEachChild(source, function visit(node) {
        // Covered by this node
        if (isPositionInsideNode(position, node)) {
          // Export variable
          if (
            tsNextPlugin.ts.isVariableStatement(node) &&
            node.modifiers?.some(
              (m) => m.kind === tsNextPlugin.ts.SyntaxKind.ExportKeyword
            )
          ) {
            if (
              tsNextPlugin.ts.isVariableDeclarationList(node.declarationList)
            ) {
              for (const declaration of node.declarationList.declarations) {
                if (isPositionInsideNode(position, declaration)) {
                  // `export const ... = ...`
                  const text = declaration.name.getText()
                  callback(text, declaration)
                }
              }
            }
          }
        }
      })
    }
  },

  /** Show docs when hovering on the exported configs. */
  getQuickInfoAtPosition(
    fileName: Parameters<tsModule.LanguageService['getQuickInfoAtPosition']>[0],
    position: Parameters<tsModule.LanguageService['getQuickInfoAtPosition']>[1]
  ): ReturnType<tsModule.LanguageService['getQuickInfoAtPosition']> {
    let overridden: tsModule.QuickInfo | undefined
    this.visitEntryConfig(fileName, position, (entryConfig, declaration) => {
      if (!(entryConfig in API_DOCS)) return

      const name = declaration.name
      const value = declaration.initializer

      const docsLink = {
        kind: 'text',
        text:
          `\n\nRead more about the "${entryConfig}" option: ` +
          API_DOCS[entryConfig].link,
      }

      if (value && isPositionInsideNode(position, value)) {
        // Hovers the value of the config
        const isString = tsNextPlugin.ts.isStringLiteral(value)
        const text = removeStringQuotes(value.getText())
        const key = isString ? `"${text}"` : text

        const isValid = API_DOCS[entryConfig].isValid
          ? API_DOCS[entryConfig].isValid?.(key)
          : !!API_DOCS[entryConfig].options?.[key]

        if (isValid) {
          overridden = {
            kind: tsNextPlugin.ts.ScriptElementKind.enumElement,
            kindModifiers: tsNextPlugin.ts.ScriptElementKindModifier.none,
            textSpan: {
              start: value.getStart(),
              length: value.getWidth(),
            },
            displayParts: [],
            documentation: [
              {
                kind: 'text',
                text:
                  API_DOCS[entryConfig].options?.[key] ||
                  API_DOCS[entryConfig].getHint?.(key) ||
                  '',
              },
              docsLink,
            ],
          }
        } else {
          // Wrong value, display the docs link
          overridden = {
            kind: tsNextPlugin.ts.ScriptElementKind.enumElement,
            kindModifiers: tsNextPlugin.ts.ScriptElementKindModifier.none,
            textSpan: {
              start: value.getStart(),
              length: value.getWidth(),
            },
            displayParts: [],
            documentation: [docsLink],
          }
        }
      } else {
        // Hovers the name of the config
        overridden = {
          kind: tsNextPlugin.ts.ScriptElementKind.enumElement,
          kindModifiers: tsNextPlugin.ts.ScriptElementKindModifier.none,
          textSpan: {
            start: name.getStart(),
            length: name.getWidth(),
          },
          displayParts: [],
          documentation: [
            {
              kind: 'text',
              text: getAPIDescription(entryConfig),
            },
            docsLink,
          ],
        }
      }
    })
    return overridden
  },

  createAutoCompletionOptionValue(sort: number, name: string, apiName: string) {
    const isString = name.startsWith('"')
    return {
      name,
      insertText: removeStringQuotes(name),
      sortText: '' + sort,
      kind: isString
        ? tsNextPlugin.ts.ScriptElementKind.string
        : tsNextPlugin.ts.ScriptElementKind.unknown,
      kindModifiers: tsNextPlugin.ts.ScriptElementKindModifier.none,
      labelDetails: {
        description: `Next.js ${apiName} option`,
      },
      data: {
        exportName: apiName,
        moduleSpecifier: 'next/typescript/entry_option_value',
      },
    } as tsModule.CompletionEntry
  },

  createAutoCompletionOptionName(sort: number, name: string) {
    return {
      name,
      sortText: `!${sort}`,
      kind: tsNextPlugin.ts.ScriptElementKind.constElement,
      kindModifiers: tsNextPlugin.ts.ScriptElementKindModifier.exportedModifier,
      labelDetails: {
        description: `Next.js ${name} option`,
      },
      data: {
        exportName: name,
        moduleSpecifier: 'next/typescript/entry_option_name',
      },
    } as tsModule.CompletionEntry
  },

  /** Auto completion for entry exported configs. */
  addCompletionsAtPosition(
    fileName: string,
    position: number,
    prior: tsModule.WithMetadata<tsModule.CompletionInfo>
  ) {
    this.visitEntryConfig(fileName, position, (entryConfig, declaration) => {
      if (!API_DOCS[entryConfig]) {
        if (isPositionInsideNode(position, declaration.name)) {
          prior.entries.push(
            ...Object.keys(API_DOCS).map((name, index) => {
              return this.createAutoCompletionOptionName(index, name)
            })
          )
        }
        return
      }

      prior.entries.push(
        ...Object.keys(API_DOCS[entryConfig].options || {}).map(
          (name, index) => {
            return this.createAutoCompletionOptionValue(
              index,
              name,
              entryConfig
            )
          }
        )
      )
    })
  },

  /**
   * Show details on the side when auto completing.
   * Note that this does not directly compare to ts.LanguageService['getCompletionEntryDetails']
   */
  getCompletionEntryDetails(
    entryName: string,
    data: tsModule.CompletionEntryData
  ) {
    if (
      data &&
      data.moduleSpecifier &&
      data.moduleSpecifier.startsWith('next/typescript')
    ) {
      let content = ''
      if (data.moduleSpecifier === 'next/typescript/entry_option_name') {
        content = getAPIDescription(entryName)
      } else {
        const options = API_DOCS[data.exportName].options
        if (!options) return
        content = options[entryName]
      }
      return {
        name: entryName,
        kind: tsNextPlugin.ts.ScriptElementKind.enumElement,
        kindModifiers: tsNextPlugin.ts.ScriptElementKindModifier.none,
        displayParts: [],
        documentation: [
          {
            kind: 'text',
            text: content,
          },
        ],
      }
    }
  },

  /** Show errors for invalid export fields. */
  getSemanticDiagnosticsForExportVariableStatement(
    source: tsModule.SourceFile,
    node: tsModule.VariableStatement
  ) {
    const diagnostics: tsModule.Diagnostic[] = []

    // Check if it has correct option exports
    if (tsNextPlugin.ts.isVariableDeclarationList(node.declarationList)) {
      for (const declaration of node.declarationList.declarations) {
        const name = declaration.name
        if (tsNextPlugin.ts.isIdentifier(name)) {
          if (!ALLOWED_EXPORTS.includes(name.text) && !API_DOCS[name.text]) {
            diagnostics.push({
              file: source,
              category: tsNextPlugin.ts.DiagnosticCategory.Error,
              code: NEXT_TS_ERRORS.INVALID_ENTRY_EXPORT,
              messageText: `"${name.text}" is not a valid Next.js entry export value.`,
              start: name.getStart(),
              length: name.getWidth(),
            })
          } else if (API_DOCS[name.text]) {
            // Check if the value is valid
            const value = declaration.initializer
            const options = API_DOCS[name.text].options

            if (value && options) {
              let displayedValue = ''
              let errorMessage = ''
              let isInvalid = false

              if (
                tsNextPlugin.ts.isStringLiteral(value) ||
                tsNextPlugin.ts.isNoSubstitutionTemplateLiteral(value)
              ) {
                const val = `"${removeStringQuotes(value.getText())}"`
                const allowedValues = Object.keys(options).filter((v) =>
                  /^['"]/.test(v)
                )

                if (
                  !allowedValues.includes(val) &&
                  !API_DOCS[name.text].isValid?.(val)
                ) {
                  isInvalid = true
                  displayedValue = val
                }
              } else if (
                tsNextPlugin.ts.isNumericLiteral(value) ||
                (tsNextPlugin.ts.isPrefixUnaryExpression(value) &&
                  tsNextPlugin.ts.isMinusToken((value as any).operator) &&
                  (tsNextPlugin.ts.isNumericLiteral(
                    (value as any).operand.kind
                  ) ||
                    (tsNextPlugin.ts.isIdentifier(
                      (value as any).operand.kind
                    ) &&
                      (value as any).operand.kind.getText() === 'Infinity'))) ||
                (tsNextPlugin.ts.isIdentifier(value) &&
                  value.getText() === 'Infinity')
              ) {
                const v = value.getText()
                if (!API_DOCS[name.text].isValid?.(v)) {
                  isInvalid = true
                  displayedValue = v
                }
              } else if (
                value.kind === tsNextPlugin.ts.SyntaxKind.TrueKeyword ||
                value.kind === tsNextPlugin.ts.SyntaxKind.FalseKeyword
              ) {
                const v = value.getText()
                if (!API_DOCS[name.text].isValid?.(v)) {
                  isInvalid = true
                  displayedValue = v
                }
              } else if (tsNextPlugin.ts.isArrayLiteralExpression(value)) {
                const v = value.getText()
                if (
                  !API_DOCS[name.text].isValid?.(
                    JSON.stringify(value.elements.map((e) => e.getText()))
                  )
                ) {
                  isInvalid = true
                  displayedValue = v
                }
              } else if (
                // Other literals
                tsNextPlugin.ts.isBigIntLiteral(value) ||
                tsNextPlugin.ts.isObjectLiteralExpression(value) ||
                tsNextPlugin.ts.isRegularExpressionLiteral(value) ||
                tsNextPlugin.ts.isPrefixUnaryExpression(value)
              ) {
                isInvalid = true
                displayedValue = value.getText()
              } else {
                // Not a literal, error because it's not statically analyzable
                isInvalid = true
                displayedValue = value.getText()
                errorMessage = `"${displayedValue}" is not a valid value for the "${name.text}" option. The configuration must be statically analyzable.`
              }

              if (isInvalid) {
                diagnostics.push({
                  file: source,
                  category: tsNextPlugin.ts.DiagnosticCategory.Error,
                  code: NEXT_TS_ERRORS.INVALID_OPTION_VALUE,
                  messageText:
                    errorMessage ||
                    `"${displayedValue}" is not a valid value for the "${name.text}" option.`,
                  start: value.getStart(),
                  length: value.getWidth(),
                })
              }
            }
          } else if (name.text === LEGACY_CONFIG_EXPORT) {
            // export const config = { ... }
            // Error if using `amp: ...`
            const value = declaration.initializer
            if (value && tsNextPlugin.ts.isObjectLiteralExpression(value)) {
              for (const prop of value.properties) {
                if (
                  tsNextPlugin.ts.isPropertyAssignment(prop) &&
                  tsNextPlugin.ts.isIdentifier(prop.name) &&
                  prop.name.text === 'amp'
                ) {
                  diagnostics.push({
                    file: source,
                    category: tsNextPlugin.ts.DiagnosticCategory.Error,
                    code: NEXT_TS_ERRORS.INVALID_CONFIG_OPTION,
                    messageText: `AMP is not supported in the app directory. If you need to use AMP it will continue to be supported in the pages directory.`,
                    start: prop.getStart(),
                    length: prop.getWidth(),
                  })
                }
              }
            }
          }
        }
      }
    }

    return diagnostics
  },
})
