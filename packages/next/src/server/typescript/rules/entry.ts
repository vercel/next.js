import path from 'path'
import fs from 'fs'

import {
  ALLOWED_LAYOUT_PROPS,
  ALLOWED_PAGE_PROPS,
  NEXT_TS_ERRORS,
} from '../constant'
import {
  getDynamicSegmentParams,
  getParamsType,
  getTs,
  isPageFile,
  isPositionInsideNode,
} from '../utils'

const entry = {
  // Give auto completion for the component's props
  getCompletionsAtPosition(
    fileName: string,
    node: ts.FunctionDeclaration,
    position: number
  ) {
    const ts = getTs()
    const entries: ts.CompletionEntry[] = []

    // Default export function might not accept parameters
    const paramNode = node.parameters?.[0] as
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

          // For page entries, the `params` prop is a dynamic object with
          // the dynamic segment names as the keys. For example, if the page
          // is `pages/[id]/[name].js`, the `params` prop will be
          // `{ id: string, name: string }`.
          // For catch all routes, the `params` prop will be `{ name: string[] }`
          // For optional catch all routes, the `params` prop will be `{ name?: string[] }`
          // If there's currently no dynamic segments, the `params` prop will not be typed.
          const paramType = getParamsType(fileName)

          validProps = ALLOWED_PAGE_PROPS
          validPropsWithType = [paramType, 'searchParams']

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
                entries.push({
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

    return entries
  },

  // Give error diagnostics for the component
  getSemanticDiagnostics(
    fileName: string,
    source: ts.SourceFile,
    node: ts.FunctionDeclaration
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

    const diagnostics: ts.Diagnostic[] = []

    const props = node.parameters?.[0]?.name

    if (props && ts.isObjectBindingPattern(props)) {
      for (const prop of (props as ts.ObjectBindingPattern).elements) {
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

    const dynamicSegmentParams = getDynamicSegmentParams(fileName)
    const hasDynamicSegments = dynamicSegmentParams.isCatchAll
      ? true
      : dynamicSegmentParams.params.length > 0

    if (!hasDynamicSegments) {
      return diagnostics
    }

    const propType = node.parameters?.[0]?.type

    if (propType && ts.isTypeLiteralNode(propType)) {
      for (const prop of propType.members) {
        const propName = prop.name?.getText()
        const typeNode = prop.getChildren().at(-1)
        if (!typeNode) {
          continue
        }

        if (propName === 'params' && ts.isTypeLiteralNode(typeNode)) {
          const correctType = getParamsType(fileName)

          for (const propInParamsProp of typeNode.members) {
            const isOptionalParamProp =
              propInParamsProp.questionToken !== undefined

            if (dynamicSegmentParams.isCatchAll) {
              // name of property match
              if (
                propInParamsProp.name?.getText() !== dynamicSegmentParams.params
              ) {
                diagnostics.push({
                  file: source,
                  category: ts.DiagnosticCategory.Error,
                  code: NEXT_TS_ERRORS.INVALID_PAGE_PROP,
                  messageText: `Type '${prop.getText()}' does not match type '${correctType}'.`,
                  start: prop.getStart(),
                  length: prop.getWidth(),
                })
              }

              // ensure that the type is a string[]
              if (
                //@ts-ignore
                propInParamsProp.type.kind !== ts.SyntaxKind.ArrayType ||
                //@ts-ignore
                propInParamsProp.type.elementType.kind !==
                  ts.SyntaxKind.StringKeyword
              ) {
                diagnostics.push({
                  file: source,
                  category: ts.DiagnosticCategory.Error,
                  code: NEXT_TS_ERRORS.INVALID_PAGE_PROP,
                  messageText: `Type '${prop.getText()}' does not match type '${correctType}'.`,
                  start: prop.getStart(),
                  length: prop.getWidth(),
                })
              }

              // match if it's a optional catch all route, and the prop is optional
              if (
                isOptionalParamProp !== dynamicSegmentParams.isOptionalCatchAll
              ) {
                diagnostics.push({
                  file: source,
                  category: ts.DiagnosticCategory.Error,
                  code: NEXT_TS_ERRORS.INVALID_PAGE_PROP,
                  messageText: `Type '${prop.getText()}' does not match type '${correctType}'.`,
                  start: prop.getStart(),
                  length: prop.getWidth(),
                })
              }
            } else {
              // not a catch all
              const propNameInParamsProp = propInParamsProp.name?.getText()

              // name of property match
              if (
                !dynamicSegmentParams.params.includes(propNameInParamsProp!)
              ) {
                diagnostics.push({
                  file: source,
                  category: ts.DiagnosticCategory.Error,
                  code: NEXT_TS_ERRORS.INVALID_PAGE_PROP,
                  messageText: `Type '${prop.getText()}' does not match type '${correctType}'.`,
                  start: prop.getStart(),
                  length: prop.getWidth(),
                })
              }

              // ensure that the type is a string
              if (
                //@ts-ignore
                propInParamsProp.type.kind !== ts.SyntaxKind.StringKeyword
              ) {
                diagnostics.push({
                  file: source,
                  category: ts.DiagnosticCategory.Error,
                  code: NEXT_TS_ERRORS.INVALID_PAGE_PROP,
                  messageText: `Type ${prop.getText()} does not match type: '${correctType}`,
                  start: prop.getStart(),
                  length: prop.getWidth(),
                })
              }
            }
          }
        }
      }
    }
    return diagnostics
  },
}

export default entry
