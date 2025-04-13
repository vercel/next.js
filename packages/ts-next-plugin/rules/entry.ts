import path from 'path'
import fs from 'fs'

import {
  ALLOWED_LAYOUT_PROPS,
  ALLOWED_PAGE_PROPS,
  NEXT_TS_ERRORS,
} from '../constant'
import { getTs, isPageFile, isPositionInsideNode } from '../utils'

import type tsModule from 'typescript/lib/tsserverlibrary'

const entry = {
  // Give auto completion for the component's props
  getCompletionsAtPosition(
    fileName: string,
    node: tsModule.FunctionDeclaration,
    position: number
  ) {
    const ts = getTs()
    const entries: tsModule.CompletionEntry[] = []

    // Default export function might not accept parameters
    const paramNode = node.parameters?.[0] as
      | tsModule.ParameterDeclaration
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
                entries.push({
                  name,
                  insertText: name,
                  sortText: '_' + name,
                  kind: ts.ScriptElementKind.memberVariableElement,
                  kindModifiers: ts.ScriptElementKindModifier.none,
                  labelDetails: {
                    description: `Next.js ${type} prop`,
                  },
                } as tsModule.CompletionEntry)
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
                entries.push({
                  name,
                  insertText: name,
                  sortText: '_' + name,
                  kind: ts.ScriptElementKind.memberVariableElement,
                  kindModifiers: ts.ScriptElementKindModifier.none,
                  labelDetails: {
                    description: `Next.js ${type} prop type`,
                  },
                } as tsModule.CompletionEntry)
              }

              break
            }
          }
        }
      }
    }

    return entries
  },

  // Give error diagnostics for the component
  getSemanticDiagnostics(
    fileName: string,
    source: tsModule.SourceFile,
    node: tsModule.FunctionDeclaration
  ) {
    const ts = getTs()

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

    const diagnostics: tsModule.Diagnostic[] = []

    const props = node.parameters?.[0]?.name
    if (props && ts.isObjectBindingPattern(props)) {
      for (const prop of props.elements) {
        const propName = (prop.propertyName || prop.name).getText()
        if (!validProps.includes(propName)) {
          diagnostics.push({
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

    return diagnostics
  },
}

export default entry
