import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { MiddlewareConfig } from '../../../analysis/get-page-static-info'

import fs from 'fs/promises'
import path from 'path'
import { stringify } from 'querystring'
import {
  type ModuleBuildInfo,
  getModuleBuildInfo,
} from '../get-module-build-info'
import { RouteKind } from '../../../../server/future/route-kind'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { decodeFromBase64, encodeToBase64 } from '../utils'
import { isInstrumentationHookFile } from '../../../worker'

type RouteLoaderOptionsPagesAPIInput = {
  kind: RouteKind.PAGES_API
  page: string
  preferredRegion: string | string[] | undefined
  absolutePagePath: string
  middlewareConfig: MiddlewareConfig
}

type RouteLoaderOptionsPagesInput = {
  kind: RouteKind.PAGES
  page: string
  pages: { [page: string]: string }
  preferredRegion: string | string[] | undefined
  absolutePagePath: string
  middlewareConfig: MiddlewareConfig
}

type RouteLoaderOptionsInput =
  | RouteLoaderOptionsPagesInput
  | RouteLoaderOptionsPagesAPIInput

type RouteLoaderPagesAPIOptions = {
  kind: RouteKind.PAGES_API

  /**
   * The page name for this particular route.
   */
  page: string

  /**
   * The preferred region for this route.
   */
  preferredRegion: string | string[] | undefined

  /**
   * The absolute path to the userland page file.
   */
  absolutePagePath: string

  /**
   * The middleware config for this route.
   */
  middlewareConfigBase64: string
}

type RouteLoaderPagesOptions = {
  kind: RouteKind.PAGES

  /**
   * The page name for this particular route.
   */
  page: string

  /**
   * The preferred region for this route.
   */
  preferredRegion: string | string[] | undefined

  /**
   * The absolute path to the userland page file.
   */
  absolutePagePath: string

  /**
   * The absolute paths to the app path file.
   */
  absoluteAppPath: string

  /**
   * The absolute paths to the document path file.
   */
  absoluteDocumentPath: string

  /**
   * The middleware config for this route.
   */
  middlewareConfigBase64: string
}

/**
 * The options for the route loader.
 */
type RouteLoaderOptions = RouteLoaderPagesOptions | RouteLoaderPagesAPIOptions

/**
 * Returns the loader entry for a given page.
 *
 * @param options the options to create the loader entry
 * @returns the encoded loader entry
 */
export function getRouteLoaderEntry(options: RouteLoaderOptionsInput): string {
  switch (options.kind) {
    case RouteKind.PAGES: {
      const query: RouteLoaderPagesOptions = {
        kind: options.kind,
        page: options.page,
        preferredRegion: options.preferredRegion,
        absolutePagePath: options.absolutePagePath,
        // These are the path references to the internal components that may be
        // overridden by userland components.
        absoluteAppPath: options.pages['/_app'],
        absoluteDocumentPath: options.pages['/_document'],
        middlewareConfigBase64: encodeToBase64(options.middlewareConfig),
      }

      return `next-route-loader?${stringify(query)}!`
    }
    case RouteKind.PAGES_API: {
      const query: RouteLoaderPagesAPIOptions = {
        kind: options.kind,
        page: options.page,
        preferredRegion: options.preferredRegion,
        absolutePagePath: options.absolutePagePath,
        middlewareConfigBase64: encodeToBase64(options.middlewareConfig),
      }

      return `next-route-loader?${stringify(query)}!`
    }
    default: {
      throw new Error('Invariant: Unexpected route kind')
    }
  }
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
 * @param replacements the replacements to perform
 * @returns the loaded file with the replacements
 */
export async function loadEntrypointWithReplacements(
  entrypoint: 'pages' | 'pages-api' | 'app-page' | 'app-route',
  replacements: Record<string, string>,
  injections?: Record<string, string>
): Promise<string> {
  const filepath = path.resolve(
    path.join(
      __dirname,
      // Load the ESM version of the entrypoint.
      '../../../../esm/build/webpack/loaders/next-route-loader/entries',
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
          // NOTE: this should be updated if this loader file is moved.
          path.normalize(path.join(__dirname, '../../../../../..')),
          path.resolve(
            path.join(__dirname, 'entries'),
            fromRequest ?? importRequest
          )
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

const loadPages = async (
  {
    page,
    absolutePagePath,
    absoluteDocumentPath,
    absoluteAppPath,
    preferredRegion,
    middlewareConfigBase64,
  }: RouteLoaderPagesOptions,
  buildInfo: ModuleBuildInfo
) => {
  const middlewareConfig: MiddlewareConfig = decodeFromBase64(
    middlewareConfigBase64
  )

  // Attach build info to the module.
  buildInfo.route = {
    page,
    absolutePagePath,
    preferredRegion,
    middlewareConfig,
  }

  let file = await loadEntrypointWithReplacements('pages', {
    VAR_USERLAND: absolutePagePath,
    VAR_MODULE_DOCUMENT: absoluteDocumentPath,
    VAR_MODULE_APP: absoluteAppPath,
    VAR_DEFINITION_PAGE: normalizePagePath(page),
    VAR_DEFINITION_PATHNAME: page,
  })

  if (isInstrumentationHookFile(page)) {
    // When we're building the instrumentation page (only when the
    // instrumentation file conflicts with a page also labeled
    // /instrumentation) hoist the `register` method.
    file += '\nexport const register = hoist(userland, "register")'
  }

  return file
}

const loadPagesAPI = async (
  {
    page,
    absolutePagePath,
    preferredRegion,
    middlewareConfigBase64,
  }: RouteLoaderPagesAPIOptions,
  buildInfo: ModuleBuildInfo
) => {
  const middlewareConfig: MiddlewareConfig = decodeFromBase64(
    middlewareConfigBase64
  )

  // Attach build info to the module.
  buildInfo.route = {
    page,
    absolutePagePath,
    preferredRegion,
    middlewareConfig,
  }

  return await loadEntrypointWithReplacements('pages-api', {
    VAR_USERLAND: absolutePagePath,
    VAR_DEFINITION_PAGE: normalizePagePath(page),
    VAR_DEFINITION_PATHNAME: page,
  })
}

/**
 * Handles the `next-route-loader` options.
 * @returns the loader definition function
 */
const loader: webpack.LoaderDefinitionFunction<RouteLoaderOptions> =
  async function () {
    if (!this._module) {
      throw new Error('Invariant: expected this to reference a module')
    }

    const buildInfo = getModuleBuildInfo(this._module)
    const opts = this.getOptions()

    switch (opts.kind) {
      case RouteKind.PAGES: {
        return await loadPages(opts, buildInfo)
      }
      case RouteKind.PAGES_API: {
        return await loadPagesAPI(opts, buildInfo)
      }
      default: {
        throw new Error('Invariant: Unexpected route kind')
      }
    }
  }

export default loader
