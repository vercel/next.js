/**
 * This is a TypeScript language service plugin for Next.js app directory,
 * it provides the following features:
 *
 * - Warns about disallowed React APIs in server components.
 * - Warns about disallowed layout and page exports.
 * - Autocompletion for entry configurations.
 * - Hover hint and docs for entry configurations.
 */

import path from 'path'
import fs from 'fs'

import {
  init,
  getIsClientEntry,
  isAppEntryFile,
  isPageFile,
  isDefaultFunctionExport,
  isPositionInsideNode,
  getSource,
} from './utils'

import entryConfig from './entry-config'
import { NEXT_TS_ERRORS } from './constant'

const DISALLOWED_SERVER_REACT_APIS: string[] = [
  'useState',
  'useEffect',
  'useLayoutEffect',
  'useDeferredValue',
  'useImperativeHandle',
  'useInsertionEffect',
  'useReducer',
  'useRef',
  'useSyncExternalStore',
  'useTransition',
  'Component',
  'PureComponent',
  'createContext',
  'createFactory',
]

const ALLOWED_PAGE_PROPS = ['params', 'searchParams']
const ALLOWED_LAYOUT_PROPS = ['params', 'children']

export function createTSPlugin(modules: {
  typescript: typeof import('typescript/lib/tsserverlibrary')
}) {
  const ts = modules.typescript

  function create(info: ts.server.PluginCreateInfo) {
    init({
      ts,
      info,
    })

    // Set up decorator object
    const proxy = Object.create(null)
    for (let k of Object.keys(info.languageService)) {
      const x = (info.languageService as any)[k]
      proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args)
    }

    // Auto completion
    proxy.getCompletionsAtPosition = (
      fileName: string,
      position: number,
      options: any
    ) => {
      let prior = info.languageService.getCompletionsAtPosition(
        fileName,
        position,
        options
      ) || {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
      }
      if (!isAppEntryFile(fileName)) return prior

      // Remove specified entries from completion list if it's a server entry.
      if (!getIsClientEntry(fileName)) {
        prior.entries = prior.entries.filter((e: ts.CompletionEntry) => {
          // Remove disallowed React APIs.
          if (
            DISALLOWED_SERVER_REACT_APIS.includes(e.name) &&
            e.kindModifiers === 'declare'
          ) {
            return false
          }
          return true
        })
      }

      const entries = entryConfig.getCompletionsAtPosition(fileName, position)
      prior.entries = [...prior.entries, ...entries]

      const program = info.languageService.getProgram()
      const source = program?.getSourceFile(fileName)
      if (!source || !program) return prior

      ts.forEachChild(source!, (node) => {
        // Auto completion for default export function's props.
        if (
          isDefaultFunctionExport(node) &&
          isPositionInsideNode(position, node)
        ) {
          // Default export function might not accept parameters
          const paramNode = (node as ts.FunctionDeclaration).parameters?.[0] as
            | ts.ParameterDeclaration
            | undefined

          if (paramNode && isPositionInsideNode(position, paramNode)) {
            const props = paramNode?.name
            if (props && ts.isObjectBindingPattern(props)) {
              let validProps = []
              let validPropsWithType = []
              let type: string

              if (isPageFile(fileName)) {
                // For page entries (page.js), it can only have `params` and `searchParams`
                // as the prop names.
                validProps = ALLOWED_PAGE_PROPS
                validPropsWithType = ALLOWED_PAGE_PROPS
                type = 'page'
              } else {
                // For layout entires, check if it has any named slots.
                const currentDir = path.dirname(fileName)
                const items = fs.readdirSync(currentDir, {
                  withFileTypes: true,
                })
                const slots = []
                for (const item of items) {
                  if (item.isDirectory() && item.name.startsWith('@')) {
                    slots.push(item.name.slice(1))
                  }
                }
                validProps = ALLOWED_LAYOUT_PROPS.concat(slots)
                validPropsWithType = ALLOWED_LAYOUT_PROPS.concat(
                  slots.map((s) => `${s}: React.ReactNode`)
                )
                type = 'layout'
              }

              // Auto completion for props
              for (const element of props.elements) {
                if (isPositionInsideNode(position, element)) {
                  const nameNode = element.propertyName || element.name

                  if (isPositionInsideNode(position, nameNode)) {
                    for (const name of validProps) {
                      prior.entries.push({
                        name,
                        insertText: name,
                        sortText: '_' + name,
                        kind: ts.ScriptElementKind.memberVariableElement,
                        kindModifiers: ts.ScriptElementKindModifier.none,
                        labelDetails: {
                          description: `Next.js ${type} prop`,
                        },
                      } as ts.CompletionEntry)
                    }
                  }

                  break
                }
              }

              // Auto completion for types
              if (paramNode.type && ts.isTypeLiteralNode(paramNode.type)) {
                for (const member of paramNode.type.members) {
                  if (isPositionInsideNode(position, member)) {
                    for (const name of validPropsWithType) {
                      prior.entries.push({
                        name,
                        insertText: name,
                        sortText: '_' + name,
                        kind: ts.ScriptElementKind.memberVariableElement,
                        kindModifiers: ts.ScriptElementKindModifier.none,
                        labelDetails: {
                          description: `Next.js ${type} prop type`,
                        },
                      } as ts.CompletionEntry)
                    }

                    break
                  }
                }
              }
            }
          }
        }
      })

      return prior
    }

    // Show auto completion details
    proxy.getCompletionEntryDetails = (
      fileName: string,
      position: number,
      entryName: string,
      formatOptions: ts.FormatCodeOptions,
      source: string,
      preferences: ts.UserPreferences,
      data: ts.CompletionEntryData
    ) => {
      const entryCompletionEntryDetails = entryConfig.getCompletionEntryDetails(
        entryName,
        data
      )
      if (entryCompletionEntryDetails) {
        return entryCompletionEntryDetails
      }

      const prior = info.languageService.getCompletionEntryDetails(
        fileName,
        position,
        entryName,
        formatOptions,
        source,
        preferences,
        data
      )

      return prior
    }

    // Quick info
    proxy.getQuickInfoAtPosition = (fileName: string, position: number) => {
      const prior = info.languageService.getQuickInfoAtPosition(
        fileName,
        position
      )
      if (!isAppEntryFile(fileName)) return prior

      // Remove type suggestions for disallowed APIs in server components.
      if (!getIsClientEntry(fileName)) {
        const definitions = info.languageService.getDefinitionAtPosition(
          fileName,
          position
        )
        if (
          definitions?.some(
            (d) =>
              DISALLOWED_SERVER_REACT_APIS.includes(d.name) &&
              d.containerName === 'React'
          )
        ) {
          return
        }
      }

      const overriden = entryConfig.getQuickInfoAtPosition(fileName, position)
      if (overriden) return overriden

      return prior
    }

    // Show errors for disallowed imports
    proxy.getSemanticDiagnostics = (fileName: string) => {
      const prior = info.languageService.getSemanticDiagnostics(fileName)
      if (!isAppEntryFile(fileName)) return prior

      const source = getSource(fileName)
      if (!source) return prior

      let isClientEntry = false

      try {
        isClientEntry = getIsClientEntry(fileName, true)
      } catch (e: any) {
        prior.push({
          file: source,
          category: ts.DiagnosticCategory.Error,
          code: NEXT_TS_ERRORS.MISPLACED_CLIENT_ENTRY,
          ...e,
        })
        isClientEntry = false
      }

      ts.forEachChild(source!, (node) => {
        if (ts.isImportDeclaration(node)) {
          if (!isClientEntry) {
            const importPath = node.moduleSpecifier.getText(source!)
            if (importPath === "'react'" || importPath === '"react"') {
              // Check if it imports "useState"
              const importClause = node.importClause
              if (importClause) {
                const namedBindings = importClause.namedBindings
                if (namedBindings && ts.isNamedImports(namedBindings)) {
                  const elements = namedBindings.elements
                  for (const element of elements) {
                    const name = element.name.getText(source!)
                    if (DISALLOWED_SERVER_REACT_APIS.includes(name)) {
                      prior.push({
                        file: source,
                        category: ts.DiagnosticCategory.Error,
                        code: NEXT_TS_ERRORS.INVALID_SERVER_API,
                        messageText: `"${name}" is not allowed in Server Components.`,
                        start: element.name.getStart(),
                        length: element.name.getWidth(),
                      })
                    }
                  }
                }
              }
            }
          }
        } else if (
          ts.isVariableStatement(node) &&
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          // Check if it has correct option exports
          const diagnostics =
            entryConfig.getSemanticDiagnosticsForExportVariableStatement(
              source,
              node
            )
          prior.push(...diagnostics)
        } else if (isDefaultFunctionExport(node)) {
          // `export default function`
          let validProps = []
          let type: string

          if (isPageFile(fileName)) {
            // For page entries (page.js), it can only have `params` and `searchParams`
            // as the prop names.
            validProps = ALLOWED_PAGE_PROPS
            type = 'page'
          } else {
            // For layout entires, check if it has any named slots.
            const currentDir = path.dirname(fileName)
            const items = fs.readdirSync(currentDir, { withFileTypes: true })
            const slots = []
            for (const item of items) {
              if (item.isDirectory() && item.name.startsWith('@')) {
                slots.push(item.name.slice(1))
              }
            }
            validProps = ALLOWED_LAYOUT_PROPS.concat(slots)
            type = 'layout'
          }

          const props = (node as ts.FunctionDeclaration).parameters?.[0]?.name
          if (props && ts.isObjectBindingPattern(props)) {
            for (const prop of (props as ts.ObjectBindingPattern).elements) {
              const propName = (prop.propertyName || prop.name).getText()
              if (!validProps.includes(propName)) {
                prior.push({
                  file: source,
                  category: ts.DiagnosticCategory.Error,
                  code: NEXT_TS_ERRORS.INVALID_PAGE_PROP,
                  messageText: `"${propName}" is not a valid ${type} prop.`,
                  start: prop.getStart(),
                  length: prop.getWidth(),
                })
              }
            }
          }
        }
      })

      return prior
    }

    return proxy
  }

  return { create }
}
