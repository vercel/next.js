import fs from 'fs/promises'
import path from 'path'

// NOTE: this should be updated if this loader file is moved.
const PACKAGE_ROOT = path.normalize(path.join(__dirname, '../../..'))
const TEMPLATE_FOLDER = path.join(__dirname, 'templates')
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
  const filepath = path.resolve(
    path.join(TEMPLATES_ESM_FOLDER, `${entrypoint}.js`)
  )

  let file = await fs.readFile(filepath, 'utf8')

  // Update the relative imports to be absolute. This will update any relative
  // imports to be relative to the root of the `next` package.
  let count = 0
  file = file.replaceAll(
    /from "(\..*)"|import "(\..*)"/g,
    function (_, fromRequest, importRequest) {
      count++

      const relative = path
        .relative(
          PACKAGE_ROOT,
          path.resolve(TEMPLATE_FOLDER, fromRequest ?? importRequest)
        )
        // Ensure that we use linux style path separators for node.
        .replace(/\\/g, '/')

      // Verify that the relative import is relative to the `next` package. This
      // will catch cases where the constants at the top of the file were not
      // updated after the file was moved.
      if (!relative.startsWith('next/')) {
        throw new Error(
          `Invariant: Expected relative import to start with "next/", found "${relative}"`
        )
      }

      return fromRequest
        ? `from ${JSON.stringify(relative)}`
        : `import ${JSON.stringify(relative)}`
    }
  )

  // Verify that at least one import was replaced. It's the case today where
  // every template file has at least one import to update, so this ensures that
  // we don't accidentally remove the import replacement code or use the wrong
  // template file.
  if (count === 0) {
    throw new Error('Invariant: Expected to replace at least one import')
  }

  const replaced = new Set<string>()

  // Replace all the template variables with the actual values. If a template
  // variable is missing, throw an error.
  file = file.replaceAll(
    new RegExp(
      `${Object.keys(replacements)
        .map((k) => `"${k}"`)
        .join('|')}`,
      'g'
    ),
    (match) => {
      const key = JSON.parse(match)

      if (!(key in replacements)) {
        throw new Error(`Invariant: Unexpected template variable ${key}`)
      }

      replaced.add(key)

      return JSON.stringify(replacements[key])
    }
  )

  // Check to see if there's any remaining template variables.
  let matches = file.match(/VAR_[A-Z_]+/g)
  if (matches) {
    throw new Error(
      `Invariant: Expected to replace all template variables, found ${matches.join(
        ', '
      )}`
    )
  }

  // Check to see if any template variable was provided but not used.
  if (replaced.size !== Object.keys(replacements).length) {
    // Find the difference between the provided replacements and the replaced
    // template variables. This will let us notify the user of any template
    // variables that were not used but were provided.
    const difference = Object.keys(replacements).filter(
      (key) => !replaced.has(key)
    )

    throw new Error(
      `Invariant: Expected to replace all template variables, missing ${difference.join(
        ', '
      )} in template`
    )
  }

  // Replace the injections.
  const injected = new Set<string>()
  if (injections) {
    // Track all the injections to ensure that we're not missing any.
    file = file.replaceAll(
      new RegExp(`// INJECT:(${Object.keys(injections).join('|')})`, 'g'),
      (_, key) => {
        if (!(key in injections)) {
          throw new Error(`Invariant: Unexpected injection ${key}`)
        }

        injected.add(key)

        return `const ${key} = ${injections[key]}`
      }
    )
  }

  // Check to see if there's any remaining injections.
  matches = file.match(/\/\/ INJECT:[A-Za-z0-9_]+/g)
  if (matches) {
    throw new Error(
      `Invariant: Expected to inject all injections, found ${matches.join(
        ', '
      )}`
    )
  }

  // Check to see if any injection was provided but not used.
  if (injected.size !== Object.keys(injections ?? {}).length) {
    // Find the difference between the provided injections and the injected
    // injections. This will let us notify the user of any injections that were
    // not used but were provided.
    const difference = Object.keys(injections ?? {}).filter(
      (key) => !injected.has(key)
    )

    throw new Error(
      `Invariant: Expected to inject all injections, missing ${difference.join(
        ', '
      )} in template`
    )
  }

  // Replace the optional imports.
  const importsAdded = new Set<string>()
  if (imports) {
    // Track all the imports to ensure that we're not missing any.
    file = file.replaceAll(
      new RegExp(
        `// OPTIONAL_IMPORT:(\\* as )?(${Object.keys(imports).join('|')})`,
        'g'
      ),
      (_, asNamespace = '', key) => {
        if (!(key in imports)) {
          throw new Error(`Invariant: Unexpected optional import ${key}`)
        }

        importsAdded.add(key)

        if (imports[key]) {
          return `import ${asNamespace}${key} from ${JSON.stringify(
            imports[key]
          )}`
        } else {
          return `const ${key} = null`
        }
      }
    )
  }

  // Check to see if there's any remaining imports.
  matches = file.match(/\/\/ OPTIONAL_IMPORT:(\* as )?[A-Za-z0-9_]+/g)
  if (matches) {
    throw new Error(
      `Invariant: Expected to inject all imports, found ${matches.join(', ')}`
    )
  }

  // Check to see if any import was provided but not used.
  if (importsAdded.size !== Object.keys(imports ?? {}).length) {
    // Find the difference between the provided imports and the injected
    // imports. This will let us notify the user of any imports that were
    // not used but were provided.
    const difference = Object.keys(imports ?? {}).filter(
      (key) => !importsAdded.has(key)
    )

    throw new Error(
      `Invariant: Expected to inject all imports, missing ${difference.join(
        ', '
      )} in template`
    )
  }

  return file
}
