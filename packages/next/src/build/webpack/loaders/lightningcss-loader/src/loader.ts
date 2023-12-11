import type { LoaderContext } from 'webpack'
import type { ILightningCssLoaderConfig } from './interface'
import { ECacheKey } from './interface'
import { transform as transformCss, type Visitor } from 'lightningcss'
import { Buffer } from 'buffer'
import { getTargets } from './utils'
import path from 'path'
import {
  getImportCode,
  type ApiParam,
  type ApiReplacement,
  type CssExport,
  type CssImport,
  getModuleCode,
  getExportCode,
} from './codegen'

function createVisitor(
  options: ILightningCssLoaderConfig,
  apis: ApiParam[],
  replacements: ApiReplacement[]
): Visitor<{}> {
  return {}
}

const LOADER_NAME = `lightningcss-loader`
export async function LightningCssLoader(
  this: LoaderContext<ILightningCssLoaderConfig>,
  source: string,
  prevMap?: Record<string, any>
): Promise<void> {
  const done = this.async()
  const options = this.getOptions()
  const { implementation, targets: userTargets, ...opts } = options

  if (implementation && typeof implementation.transformCss !== 'function') {
    done(
      new TypeError(
        `[${LOADER_NAME}]: options.implementation.transformCss must be an 'lightningcss' transform function. Received ${typeof implementation.transformCss}`
      )
    )
    return
  }

  const exports: CssExport[] = []
  const imports: CssImport[] = []
  const api: ApiParam[] = []
  const replacements: ApiReplacement[] = []

  if (options.modules.exportOnlyLocals !== true) {
    imports.unshift({
      type: 'api_import',
      importName: '___CSS_LOADER_API_IMPORT___',
      url: stringifyRequest(this, require.resolve('./runtime/api')),
    })

    if (options.sourceMap) {
      imports.unshift({
        importName: '___CSS_LOADER_API_SOURCEMAP_IMPORT___',
        url: stringifyRequest(this, require.resolve('./runtime/sourceMaps')),
      })
    } else {
      imports.unshift({
        importName: '___CSS_LOADER_API_NO_SOURCEMAP_IMPORT___',
        url: stringifyRequest(this, require.resolve('./runtime/noSourceMaps')),
      })
    }
  }
  const transform = implementation?.transformCss ?? transformCss

  try {
    const { code, map } = transform({
      visitor: createVisitor(options, api, replacements),
      filename: this.resourcePath,
      code: Buffer.from(source),
      sourceMap: this.sourceMap,
      targets: getTargets({ default: userTargets, key: ECacheKey.loader }),
      inputSourceMap:
        this.sourceMap && prevMap ? JSON.stringify(prevMap) : undefined,
      ...opts,
    })
    const cssCodeAsString = code.toString()

    const importCode = getImportCode(imports, options)
    const moduleCode = getModuleCode(
      { css: cssCodeAsString, map },
      api,
      replacements,
      options,
      this
    )
    const exportCode = getExportCode(exports, replacements, options)

    const esCode = `${importCode}${moduleCode}${exportCode}`
    done(null, esCode, map && JSON.parse(map.toString()))
  } catch (error: unknown) {
    done(error as Error)
  }
}

export const raw = true

const matchRelativePath = /^\.\.?[/\\]/

function isAbsolutePath(str: string) {
  return path.posix.isAbsolute(str) || path.win32.isAbsolute(str)
}

function isRelativePath(str: string) {
  return matchRelativePath.test(str)
}

// TODO simplify for the next major release
function stringifyRequest(
  loaderContext: LoaderContext<ILightningCssLoaderConfig>,
  request: string
) {
  if (
    typeof loaderContext.utils !== 'undefined' &&
    typeof loaderContext.utils.contextify === 'function'
  ) {
    return JSON.stringify(
      loaderContext.utils.contextify(
        loaderContext.context || loaderContext.rootContext,
        request
      )
    )
  }

  const splitted = request.split('!')
  const { context } = loaderContext

  return JSON.stringify(
    splitted
      .map((part) => {
        // First, separate singlePath from query, because the query might contain paths again
        const splittedPart = part.match(/^(.*?)(\?.*)/)
        const query = splittedPart ? splittedPart[2] : ''
        let singlePath = splittedPart ? splittedPart[1] : part

        if (isAbsolutePath(singlePath) && context) {
          singlePath = path.relative(context, singlePath)

          if (isAbsolutePath(singlePath)) {
            // If singlePath still matches an absolute path, singlePath was on a different drive than context.
            // In this case, we leave the path platform-specific without replacing any separators.
            // @see https://github.com/webpack/loader-utils/pull/14
            return singlePath + query
          }

          if (isRelativePath(singlePath) === false) {
            // Ensure that the relative path starts at least with ./ otherwise it would be a request into the modules directory (like node_modules).
            singlePath = `./${singlePath}`
          }
        }

        return singlePath.replace(/\\/g, '/') + query
      })
      .join('!')
  )
}
