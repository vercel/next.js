import fs from 'fs/promises'
import path from 'path'
import { getBindingsSync } from './swc'

// NOTE: this should be updated if this loader file is moved.
const PACKAGE_ROOT = path.normalize(path.join(__dirname, '../..'))
const TEMPLATE_SRC_FOLDER = path.normalize(path.join(__dirname, './templates'))
const TEMPLATES_ESM_FOLDER = path.normalize(
  path.join(__dirname, '../../dist/esm/build/templates')
)

export interface RawSourceMap {
  version: number
  sources: string[]
  sourcesContent?: (string | null)[]
  mappings: string
  names?: string[]
  file?: string
}

/**
 * Adjusts a source map's VLQ mappings to account for line offsets introduced
 * by template expansion (INJECT: replacements that change line counts).
 *
 * VLQ mappings are delimited by ';' (one group per generated line). Inserting
 * empty groups shifts subsequent lines without affecting VLQ relative state.
 */
function adjustSourceMapMappings(
  mappings: string,
  prependLineCount: number,
  injectionOffsets: Array<{ originalLine: number; delta: number }>
): string {
  const originalGroups = mappings.split(';')
  const adjusted: string[] = []

  // 1. Prepend empty groups for lines added before the template.
  for (let i = 0; i < prependLineCount; i++) {
    adjusted.push('')
  }

  // 2. Walk original groups, inserting extra empty groups at INJECT: points.
  for (let i = 0; i < originalGroups.length; i++) {
    adjusted.push(originalGroups[i])
    for (const offset of injectionOffsets) {
      if (offset.originalLine === i) {
        for (let j = 0; j < offset.delta; j++) {
          adjusted.push('')
        }
      }
    }
  }

  return adjusted.join(';')
}

/**
 * Finds 0-indexed line positions of `// INJECT:` comments in the template
 * content and computes line deltas for each injection.
 */
function computeInjectionOffsets(
  originalContent: string,
  injections: Record<string, string>
): Array<{ originalLine: number; delta: number }> {
  const offsets: Array<{ originalLine: number; delta: number }> = []
  for (const key of Object.keys(injections)) {
    const marker = `// INJECT:${key}`
    const idx = originalContent.indexOf(marker)
    if (idx === -1) continue
    const originalLine =
      originalContent.substring(0, idx).split('\n').length - 1
    const replacement = `const ${key} = ${injections[key]}`
    const replacementLines = replacement.split('\n').length
    const delta = replacementLines - 1 // original comment was 1 line
    offsets.push({ originalLine, delta })
  }
  return offsets
}

/**
 * Load the entrypoint file from the ESM directory and performs string
 * replacements of the template variables specified in the `replacements`
 * argument.
 *
 * For non-string replacements, the template should use the
 * `declare const ${key}: ${type}` syntax. to ensure that the type is correct
 * and the typescript can compile. You may have to use `@ts-expect-error` to
 * handle replacement values that are related to imports.
 *
 * @param entrypoint the entrypoint to load
 * @param replacements string replacements to perform
 * @param injections code injections to perform
 * @param imports optional imports to insert or set to null
 * @returns the loaded file with the replacements and an adjusted source map
 */
export async function loadEntrypoint(
  entrypoint:
    | 'app-page'
    | 'app-route'
    | 'edge-app-route'
    | 'edge-ssr'
    | 'edge-ssr-app'
    | 'middleware'
    | 'pages'
    | 'pages-api',
  replacements: Record<`VAR_${string}`, string>,
  injections?: Record<string, string>,
  imports?: Record<string, string | null>
): Promise<{ code: string; map: RawSourceMap | null }> {
  const templatePath = path.resolve(
    path.join(TEMPLATES_ESM_FOLDER, `${entrypoint}.js`)
  )
  const content = await fs.readFile(templatePath)

  const code = getBindingsSync().expandNextJsTemplate(
    content,
    // Ensure that we use unix-style path separators for the import paths
    path.join(TEMPLATE_SRC_FOLDER, `${entrypoint}.js`).replace(/\\/g, '/'),
    PACKAGE_ROOT.replace(/\\/g, '/'),
    replacements,
    injections ?? {},
    imports ?? {}
  )

  // Try to load and adjust the source map for this template.
  let map: RawSourceMap | null = null
  try {
    const mapPath = templatePath + '.map'
    const mapContent = await fs.readFile(mapPath, 'utf-8')
    const originalMap: RawSourceMap = JSON.parse(mapContent)
    const injectionOffsets = computeInjectionOffsets(
      content.toString('utf-8'),
      injections ?? {}
    )
    const adjustedMappings = adjustSourceMapMappings(
      originalMap.mappings,
      0, // no prepend at this level; the loader handles prepending
      injectionOffsets
    )
    map = { ...originalMap, mappings: adjustedMappings }
  } catch {
    // Source map not available; continue without it.
  }

  return { code, map }
}
