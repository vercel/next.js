import type tsModule from 'typescript/lib/tsserverlibrary'
import { API_DOCS } from './constant'

export function removeStringQuotes(str: string): string {
  return str.replace(/^['"`]|['"`]$/g, '')
}

export const isPositionInsideNode = (position: number, node: tsModule.Node) => {
  const start = node.getFullStart()
  return start <= position && position <= node.getFullWidth() + start
}

/** Check if the type is `Promise<T>`. */
export const isPromiseType = (type: tsModule.Type, typeChecker: tsModule.TypeChecker) => {
  const typeReferenceType = type as tsModule.TypeReference
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