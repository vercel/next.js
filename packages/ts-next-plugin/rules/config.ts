// This module provides intellisense for page and layout's exported configs.

import {
  getAPIDescription,
  isPositionInsideNode,
  removeStringQuotes,
} from '../utils'
import {
  NEXT_TS_ERRORS,
  ALLOWED_EXPORTS,
  LEGACY_CONFIG_EXPORT,
  API_DOCS,
} from '../constant'
import ts from 'typescript'
import type { TSNextPlugin } from '../TSNextPlugin'

export const config = (tsNextPlugin: TSNextPlugin) => ({
  visitEntryConfig(
    fileName: string,
    position: number,
    callback: (entryConfig: string, value: ts.VariableDeclaration) => void
  ) {
    const source = tsNextPlugin.getSource(fileName)
    if (source) {
      ts.forEachChild(source, function visit(node) {
        // Covered by this node
        if (isPositionInsideNode(position, node)) {
          // Export variable
          if (
            ts.isVariableStatement(node) &&
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
          ) {
            if (ts.isVariableDeclarationList(node.declarationList)) {
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
    fileName: Parameters<ts.LanguageService['getQuickInfoAtPosition']>[0],
    position: Parameters<ts.LanguageService['getQuickInfoAtPosition']>[1]
  ): ReturnType<ts.LanguageService['getQuickInfoAtPosition']> {
    let overridden: ts.QuickInfo | undefined
    this.visitEntryConfig(fileName, position, (entryConfig, declaration) => {
      if (!(entryConfig in API_DOCS)) return

      const name = declaration.name
      const value = declaration.initializer

      const docsLink = {
        kind: 'text',
        text: `\n\nRead more about the "${entryConfig}" option: ${API_DOCS[entryConfig].link}`,
      }

      if (value && isPositionInsideNode(position, value)) {
        // Hovers the value of the config
        const isString = ts.isStringLiteral(value)
        const text = removeStringQuotes(value.getText())
        const key = isString ? `"${text}"` : text

        const isValid = API_DOCS[entryConfig].isValid
          ? API_DOCS[entryConfig].isValid?.(key)
          : !!API_DOCS[entryConfig].options?.[key]

        if (isValid) {
          overridden = {
            kind: ts.ScriptElementKind.enumElement,
            kindModifiers: ts.ScriptElementKindModifier.none,
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
            kind: ts.ScriptElementKind.enumElement,
            kindModifiers: ts.ScriptElementKindModifier.none,
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
          kind: ts.ScriptElementKind.enumElement,
          kindModifiers: ts.ScriptElementKindModifier.none,
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
      sortText: `${sort}`,
      kind: isString
        ? ts.ScriptElementKind.string
        : ts.ScriptElementKind.unknown,
      kindModifiers: ts.ScriptElementKindModifier.none,
      labelDetails: {
        description: `Next.js ${apiName} option`,
      },
      data: {
        exportName: apiName,
        moduleSpecifier: 'next/typescript/entry_option_value',
      },
    } as ts.CompletionEntry
  },

  createAutoCompletionOptionName(sort: number, name: string) {
    return {
      name,
      sortText: `!${sort}`,
      kind: ts.ScriptElementKind.constElement,
      kindModifiers: ts.ScriptElementKindModifier.exportedModifier,
      labelDetails: {
        description: `Next.js ${name} option`,
      },
      data: {
        exportName: name,
        moduleSpecifier: 'next/typescript/entry_option_name',
      },
    } as ts.CompletionEntry
  },

  /** Auto completion for entry exported configs. */
  addCompletionsAtPosition(
    fileName: string,
    position: number,
    prior: ts.WithMetadata<ts.CompletionInfo>
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
  getCompletionEntryDetails(entryName: string, data: ts.CompletionEntryData) {
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
        kind: ts.ScriptElementKind.enumElement,
        kindModifiers: ts.ScriptElementKindModifier.none,
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
    sourceFile: ts.SourceFile,
    node: ts.VariableStatement
  ) {
    const diagnostics: ts.Diagnostic[] = []

    // Check if it has correct option exports
    if (ts.isVariableDeclarationList(node.declarationList)) {
      for (const declaration of node.declarationList.declarations) {
        const name = declaration.name
        if (ts.isIdentifier(name)) {
          if (!ALLOWED_EXPORTS.includes(name.text) && !API_DOCS[name.text]) {
            diagnostics.push({
              ...NEXT_TS_ERRORS.INVALID_ENTRY_EXPORT(name.text),
              file: sourceFile,
              start: name.getStart(),
              length: name.getWidth(),
            })
          } else if (API_DOCS[name.text]) {
            // Check if the value is valid
            const expression = declaration.initializer
            if (!expression) continue
            const invalidOptionError = validateOptions(expression, name.text)
            if (invalidOptionError) {
              diagnostics.push({
                ...invalidOptionError,
                file: sourceFile,
                start: expression.getStart(),
                length: expression.getWidth(),
              })
            }
          } else if (name.text === LEGACY_CONFIG_EXPORT) {
            // export const config = { ... }
            // Error if using `amp: ...`
            const value = declaration.initializer
            if (value && ts.isObjectLiteralExpression(value)) {
              for (const prop of value.properties) {
                if (
                  ts.isPropertyAssignment(prop) &&
                  ts.isIdentifier(prop.name) &&
                  prop.name.text === 'amp'
                ) {
                  diagnostics.push({
                    ...NEXT_TS_ERRORS.INVALID_AMP_IN_APP_DIR,
                    file: sourceFile,
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

const validateOptions = (expression: ts.Expression, option: string) => {
  const valueText = expression.getText()
  const options = API_DOCS[option].options
  if (!options) return

  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    const val = `"${removeStringQuotes(valueText)}"`
    const allowedValues = Object.keys(options).filter((v) => /^['"]/.test(v))
    if (!allowedValues.includes(val) && !API_DOCS[option].isValid?.(val)) {
      return NEXT_TS_ERRORS.INVALID_OPTION_STATIC_VALUE(val, option)
    }
    return
  }

  if (
    ts.isNumericLiteral(expression) ||
    (ts.isPrefixUnaryExpression(expression) &&
      ts.isMinusToken((expression as any).operator) &&
      (ts.isNumericLiteral((expression as any).operand.kind) ||
        (ts.isIdentifier((expression as any).operand.kind) &&
          (expression as any).operand.kind.getText() === 'Infinity'))) ||
    (ts.isIdentifier(expression) && valueText === 'Infinity')
  ) {
    if (!API_DOCS[option].isValid?.(valueText)) {
      return NEXT_TS_ERRORS.INVALID_OPTION_STATIC_VALUE(valueText, option)
    }
    return
  }

  if (
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword
  ) {
    if (!API_DOCS[option].isValid?.(valueText)) {
      return NEXT_TS_ERRORS.INVALID_OPTION_STATIC_VALUE(valueText, option)
    }
    return
  }

  if (ts.isArrayLiteralExpression(expression)) {
    if (
      !API_DOCS[option].isValid?.(
        JSON.stringify(expression.elements.map((e) => e.getText()))
      )
    ) {
      return NEXT_TS_ERRORS.INVALID_OPTION_STATIC_VALUE(valueText, option)
    }
    return
  }

  if (
    // Other literals
    ts.isBigIntLiteral(expression) ||
    ts.isObjectLiteralExpression(expression) ||
    ts.isRegularExpressionLiteral(expression) ||
    ts.isPrefixUnaryExpression(expression)
  ) {
    // Not a literal, error because it's not statically analyzable
    return NEXT_TS_ERRORS.INVALID_OPTION_STATIC_VALUE(valueText, option)
  }

  // Not a literal, error because it's not statically analyzable
  return NEXT_TS_ERRORS.INVALID_OPTION_NOT_STATIC_VALUE(valueText, option)
}
