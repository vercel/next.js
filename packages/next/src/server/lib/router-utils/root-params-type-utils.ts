import type { RouteTypesManifest } from './route-types-utils'

export type RootParamValueType = 'string' | 'string[]' | 'undefined'

export type RootParamInfo = Set<RootParamValueType>

const ROOT_PARAM_VALUE_TYPES: RootParamValueType[] = [
  'string',
  'string[]',
  'undefined',
]

/**
 * Generates TypeScript type definitions for root params.
 * Creates a `declare module 'next/root-params'` block with async getter functions
 * for each root parameter.
 */
export function generateRootParamsTypes(
  rootParams: Map<string, RootParamInfo>
): string {
  const exports = Array.from(rootParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([paramName, info]) =>
        `  export function ${paramName}(): ${getRootParamReturnType(info)}`
    )

  return `// Type definitions for Next.js root params (next/root-params)

declare module 'next/root-params' {
${exports.join('\n')}
}
`
}

function getRootParamReturnType(valueTypes: RootParamInfo): string {
  const orderedValueTypes = ROOT_PARAM_VALUE_TYPES.filter((valueType) =>
    valueTypes.has(valueType)
  )

  return `Promise<${orderedValueTypes.join(' | ')}>`
}

/**
 * Returns the root-params type definitions for the root params collected from
 * layouts. Without root params this is an empty declaration, so the import in
 * next-env.d.ts still resolves.
 */
export function generateRootParamsFileContent(
  manifest: RouteTypesManifest
): string {
  const rootParams = manifest.rootParams

  if (!rootParams.size) {
    return `// Type definitions for Next.js root params (next/root-params)\n// No root params detected.\nexport {}\n`
  }

  return generateRootParamsTypes(rootParams)
}
