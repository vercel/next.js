import fs from 'fs/promises'
import path from 'path'
import { loadBindings } from './swc'

// NOTE: this should be updated if this loader file is moved.
const PACKAGE_ROOT = path.normalize(path.join(__dirname, '../..'))
const TEMPLATE_SRC_FOLDER = path.normalize(path.join(__dirname, './templates'))
const TEMPLATES_ESM_FOLDER = path.normalize(
  path.join(__dirname, '../../dist/esm/build/templates')
)

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
 * @returns the loaded file with the replacements
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
): Promise<string> {
  let bindings = await loadBindings()

  const templatePath = path.resolve(
    path.join(TEMPLATES_ESM_FOLDER, `${entrypoint}.js`)
  )
  let content = await fs.readFile(templatePath)

  return bindings.expandNextJsTemplate(
    content,
    // Ensure that we use unix-style path separators for the import paths
    path.join(TEMPLATE_SRC_FOLDER, `${entrypoint}.js`).replace(/\\/g, '/'),
    PACKAGE_ROOT.replace(/\\/g, '/'),
    replacements,
    injections ?? {},
    imports ?? {}
  )
}
