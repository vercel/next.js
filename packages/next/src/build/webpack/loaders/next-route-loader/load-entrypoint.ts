import fs from 'fs/promises'
import path from 'path'

// NOTE: this should be updated if this loader file is moved.
const PACKAGE_ROOT = path.normalize(path.join(__dirname, '../../../../../..'))
const TEMPLATE_FOLDER = path.join(__dirname, 'entries')

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
 * @param replacements the replacements to perform
 * @returns the loaded file with the replacements
 */

export async function loadEntrypoint(
  entrypoint: 'pages' | 'pages-api' | 'app-page' | 'app-route',
  replacements: Record<`VAR_${string}`, string>,
  injections?: Record<string, string>
): Promise<string> {
  const filepath = path.resolve(
    path.join(
      __dirname,
      // Load the ESM version of the entrypoint.
      '../../../../esm/build/webpack/loaders/next-route-loader/templates',
      `${entrypoint}.js`
    )
  )

  let file = await fs.readFile(filepath, 'utf8')

  // Update the relative imports to be absolute. This will update any relative
  // imports to be relative to the root of the `next` package.
  let count = 0
  file = file.replaceAll(
    /(?:from "(\..*)"|import "(\..*)")/g,
    function (_, fromRequest, importRequest) {
      count++

      const relative = path
        .relative(
          PACKAGE_ROOT,
          path.resolve(TEMPLATE_FOLDER, fromRequest ?? importRequest)
        )
        // Ensure that we use linux style path separators for node.
        .replace(/\\/g, '/')

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

  if (replaced.size !== Object.keys(replacements).length) {
    const difference = Object.keys(replacements).filter(
      (key) => !replaced.has(key)
    )

    throw new Error(
      `Invariant: Expected to replace all template variables, missing ${difference.join(
        ', '
      )} in template`
    )
  }

  // Inject the injections.
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

  if (injected.size !== Object.keys(injections ?? {}).length) {
    const difference = Object.keys(injections ?? {}).filter(
      (key) => !injected.has(key)
    )

    throw new Error(
      `Invariant: Expected to inject all injections, missing ${difference.join(
        ', '
      )} in template`
    )
  }

  return file
}
