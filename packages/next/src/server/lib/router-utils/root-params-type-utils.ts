import fs from 'fs'
import path from 'path'

export type RootParamKind = 'dynamic' | 'catchall' | 'optional-catchall'

/**
 * Generates TypeScript type definitions for the next/root-params virtual module.
 * Creates typed getter functions for each root param found in the app's root layouts.
 */
export function generateRootParamsTypes(
  rootParams: Map<string, RootParamKind>
): string {
  const entries = Array.from(rootParams.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  const functions = entries.map(([name, kind]) => {
    const returnType =
      kind === 'dynamic'
        ? 'Promise<string>'
        : kind === 'catchall'
          ? 'Promise<string[]>'
          : 'Promise<string[] | undefined>'
    return `  export function ${name}(): ${returnType}`
  })

  return `// Type definitions for Next.js root params

declare module 'next/root-params' {
${functions.join('\n')}
}
`
}

/**
 * Writes root params type definitions to a file if rootParams exist.
 * This is used by both the CLI (next type-gen) and dev server to generate
 * root-params.d.ts in the types directory.
 */
export function writeRootParamsTypes(
  rootParams: Map<string, RootParamKind> | undefined,
  filePath: string
) {
  if (!rootParams || rootParams.size === 0) {
    return
  }

  const dirname = path.dirname(filePath)

  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
  }

  const content = generateRootParamsTypes(rootParams)
  fs.writeFileSync(filePath, content)
}
