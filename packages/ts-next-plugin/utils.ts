import ts from 'typescript'
import { API_DOCS } from './constant'

export function removeStringQuotes(str: string): string {
  return str.replace(/^['"`]|['"`]$/g, '')
}

export const isPositionInsideNode = (position: number, node: ts.Node) => {
  const start = node.getFullStart()
  return start <= position && position <= node.getFullWidth() + start
}

/** Check if the type is `Promise<T>`. */
export const isPromiseType = (type: ts.Type, typeChecker: ts.TypeChecker) => {
  if (!('target' in type)) {
    return false
  }

  const typeReferenceType = type as ts.TypeReference // TODO this appears like it could be a bug - ts.Type and ts.TypeReference are not the same
  if (!typeReferenceType.target) return false

  // target should be Promise or Promise<...>
  if (
    !/^Promise(<.+>)?$/.test(typeChecker.typeToString(typeReferenceType.target))
  ) {
    return false
  }

  return true
}

export function getAPIDescription(api: keyof typeof API_DOCS): string {
  const apiDoc = API_DOCS[api]
  if ('options' in apiDoc) {
    const optionsDescription = Object.entries(apiDoc.options || {})
      .map(([key, value]) => `- \`${key}\`: ${value}`)
      .join('\n')

    return `${apiDoc.description}\n\n${optionsDescription}`
  }
  return apiDoc.description
}

export const isDefaultFunctionExport = (
  node: ts.Node
): node is ts.FunctionDeclaration => {
  if (ts.isFunctionDeclaration(node)) {
    let hasExportKeyword = false
    let hasDefaultKeyword = false

    if (node.modifiers) {
      for (const modifier of node.modifiers) {
        if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
          hasExportKeyword = true
        } else if (modifier.kind === ts.SyntaxKind.DefaultKeyword) {
          hasDefaultKeyword = true
        }
      }
    }

    // `export default function`
    if (hasExportKeyword && hasDefaultKeyword) {
      return true
    }
  }
  return false
}
