import fs from 'fs'
import path from 'path'
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
    .map(([paramName, info], index) =>
      generateRootParamExport(paramName, getRootParamReturnType(info), index)
    )

  return `// Type definitions for Next.js root params (next/root-params)

declare module 'next/root-params' {
${exports.join('\n')}
}
`
}

const JS_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function generateRootParamExport(
  paramName: string,
  returnType: string,
  index: number
) {
  if (JS_IDENTIFIER_REGEX.test(paramName)) {
    return `  export function ${paramName}(): ${returnType}`
  }

  const safeName = `__next_root_param_${index}`
  return `  function ${safeName}(): ${returnType}
  export { ${safeName} as ${JSON.stringify(paramName)} }`
}

function getRootParamReturnType(valueTypes: RootParamInfo): string {
  const orderedValueTypes = ROOT_PARAM_VALUE_TYPES.filter((valueType) =>
    valueTypes.has(valueType)
  )

  return `Promise<${orderedValueTypes.join(' | ')}>`
}

/**
 * Writes root-params type definitions to a file if root params were collected
 * from layouts.
 */
export async function writeRootParamsTypes(
  manifest: RouteTypesManifest,
  filePath: string
) {
  const rootParams = manifest.rootParams

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })

  if (!rootParams.size) {
    // Write an empty declaration so the import in next-env.d.ts resolves.
    await fs.promises.writeFile(
      filePath,
      `// Type definitions for Next.js root params (next/root-params)\n// No root params detected.\nexport {}\n`
    )
    return
  }

  await fs.promises.writeFile(filePath, generateRootParamsTypes(rootParams))
}
