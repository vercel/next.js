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

const VALID_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export function isValidIdentifier(name: string): boolean {
  return VALID_IDENTIFIER_REGEX.test(name)
}

/**
 * Returns a valid identifier that a root param whose name is not a valid
 * identifier (e.g. `lang-country`) can be declared under, before being
 * re-exported under its original name via a string module export name.
 */
export function safeRootParamIdentifier(paramName: string): string {
  return '_' + paramName.replace(/[^A-Za-z0-9_$]/g, '_')
}

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
    .map(([paramName, info]) => {
      if (isValidIdentifier(paramName)) {
        return `  export function ${paramName}(): ${getRootParamReturnType(info)}`
      }
      // Param names like `lang-country` are not valid JS identifiers, so they
      // cannot be named function exports. Declare a safely-named function and
      // re-export it under the original param name via a string module export
      // name (arbitrary module namespace identifier).
      const safeName = safeRootParamIdentifier(paramName)
      return `  function ${safeName}(): ${getRootParamReturnType(info)}\n  export { ${safeName} as ${JSON.stringify(paramName)} }`
    })

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
