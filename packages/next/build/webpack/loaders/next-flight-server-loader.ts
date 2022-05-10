import { builtinModules } from 'module'

import { parse } from '../../swc'
import {
  buildExports,
  createClientComponentFilter,
  createServerComponentFilter,
  isNextBuiltinClientComponent,
} from './utils'

function createFlightServerRequest(
  request: string,
  options?: { client: 1 | undefined }
) {
  return `next-flight-server-loader${
    options ? '?' + JSON.stringify(options) : ''
  }!${request}`
}

function hasFlightLoader(request: string, type: 'client' | 'server') {
  return request.includes(`next-flight-${type}-loader`)
}

async function parseModuleInfo({
  resourcePath,
  source,
  isClientCompilation,
  isServerComponent,
  isClientComponent,
  resolver,
}: {
  resourcePath: string
  source: string
  isClientCompilation: boolean
  isServerComponent: (name: string) => boolean
  isClientComponent: (name: string) => boolean
  resolver: (req: string) => Promise<string>
}): Promise<{
  source: string
  imports: string[]
  isEsm: boolean
  __N_SSP: boolean
  pageRuntime: 'edge' | 'nodejs' | null
}> {
  const ast = await parse(source, {
    filename: resourcePath,
    isModule: 'unknown',
  })
  const { type, body } = ast
  const beginPos = ast.span.start
  let transformedSource = ''
  let lastIndex = 0
  let imports = []
  let __N_SSP = false
  let pageRuntime = null
  let isBuiltinModule
  let isNodeModuleImport

  const isEsm = type === 'Module'

  async function getModuleType(path: string) {
    const isBuiltinModule_ = builtinModules.includes(path)
    const resolvedPath = isBuiltinModule_ ? path : await resolver(path)

    const isNodeModuleImport_ =
      /[\\/]node_modules[\\/]/.test(resolvedPath) &&
      // exclude next built-in modules
      !isNextBuiltinClientComponent(resolvedPath)

    return [isBuiltinModule_, isNodeModuleImport_] as const
  }

  function addClientImport(path: string) {
    if (isServerComponent(path) || hasFlightLoader(path, 'server')) {
      // If it's a server component, we recursively import its dependencies.
      imports.push(path)
    } else if (isClientComponent(path)) {
      // Client component.
      imports.push(path)
    } else {
      // Shared component.
      imports.push(createFlightServerRequest(path, { client: 1 }))
    }
  }

  for (let i = 0; i < body.length; i++) {
    const node = body[i]
    switch (node.type) {
      case 'ImportDeclaration':
        const importSource = node.source.value

        ;[isBuiltinModule, isNodeModuleImport] = await getModuleType(
          importSource
        )

        // matching node_module package but excluding react cores since react is required to be shared
        const isReactImports = [
          'react',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
        ].includes(importSource)

        if (!isClientCompilation) {
          // Server compilation for .server.js.
          if (isServerComponent(importSource)) {
            continue
          }

          const importDeclarations = source.substring(
            lastIndex,
            node.source.span.start - beginPos
          )

          if (isClientComponent(importSource)) {
            transformedSource += importDeclarations
            transformedSource += JSON.stringify(
              `next-flight-client-loader!${importSource}`
            )
            imports.push(importSource)
          } else {
            // A shared component. It should be handled as a server component.
            const serverImportSource =
              isReactImports || isBuiltinModule
                ? importSource
                : createFlightServerRequest(importSource)
            transformedSource += importDeclarations
            transformedSource += JSON.stringify(serverImportSource)

            // TODO: support handling RSC components from node_modules
            if (!isNodeModuleImport) {
              imports.push(importSource)
            }
          }
        } else {
          // For now we assume there is no .client.js inside node_modules.
          // TODO: properly handle this.
          if (isNodeModuleImport || isBuiltinModule) continue
          addClientImport(importSource)
        }

        lastIndex = node.source.span.end - beginPos
        break
      case 'ExportDeclaration':
        if (isClientCompilation) {
          // Keep `__N_SSG` and `__N_SSP` exports.
          if (node.declaration?.type === 'VariableDeclaration') {
            for (const declaration of node.declaration.declarations) {
              if (declaration.type === 'VariableDeclarator') {
                if (declaration.id?.type === 'Identifier') {
                  const value = declaration.id.value
                  if (value === '__N_SSP') {
                    __N_SSP = true
                  } else if (value === 'config') {
                    const props = declaration.init.properties
                    const runtimeKeyValue = props.find(
                      (prop: any) => prop.key.value === 'runtime'
                    )
                    const runtime = runtimeKeyValue?.value?.value
                    if (runtime === 'nodejs' || runtime === 'edge') {
                      pageRuntime = runtime
                    }
                  }
                }
              }
            }
          }
        }
        break
      case 'ExportNamedDeclaration':
        if (isClientCompilation) {
          if (node.source) {
            // export { ... } from '...'
            const path = node.source.value
            ;[isBuiltinModule, isNodeModuleImport] = await getModuleType(path)
            if (!isBuiltinModule && !isNodeModuleImport) {
              addClientImport(path)
            }
          }
        }
        break
      default:
        break
    }
  }

  if (!isClientCompilation) {
    transformedSource += source.substring(lastIndex)
  }

  return { source: transformedSource, imports, isEsm, __N_SSP, pageRuntime }
}

export default async function transformSource(
  this: any,
  source: string
): Promise<string> {
  const { client: isClientCompilation } = this.getOptions()
  const { resourcePath, resolve: resolveFn, context } = this

  const resolver = (req: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      resolveFn(context, req, (err: any, result: string) => {
        if (err) return reject(err)
        resolve(result)
      })
    })
  }

  if (typeof source !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const isServerComponent = createServerComponentFilter()
  const isClientComponent = createClientComponentFilter()
  const hasAppliedFlightServerLoader = this.loaders.some((loader: any) => {
    return hasFlightLoader(loader.path, 'server')
  })
  const isServerExt = isServerComponent(resourcePath)

  if (!isClientCompilation) {
    // We only apply the loader to server components, or shared components that
    // are imported by a server component.
    if (!isServerExt && !hasAppliedFlightServerLoader) {
      return source
    }
  }

  const {
    source: transformedSource,
    imports,
    isEsm,
    __N_SSP,
    pageRuntime,
  } = await parseModuleInfo({
    resourcePath,
    source,
    isClientCompilation,
    isServerComponent,
    isClientComponent,
    resolver,
  })

  /**
   * For .server.js files, we handle this loader differently.
   *
   * Server compilation output:
   *   (The content of the Server Component module will be kept.)
   *   export const __next_rsc__ = { __webpack_require__, _: () => { ... }, server: true }
   *
   * Client compilation output:
   *   (The content of the Server Component module will be removed.)
   *   export const __next_rsc__ = { __webpack_require__, _: () => { ... }, server: false }
   */

  const rscExports: any = {
    __next_rsc__: `{
      __webpack_require__,
      _: () => {
        ${imports
          .map(
            (importSource) =>
              `import(/* webpackMode: "eager" */ ${JSON.stringify(
                importSource
              )});`
          )
          .join('\n')}
      },
      server: ${isServerExt ? 'true' : 'false'}
    }`,
  }

  if (isClientCompilation) {
    rscExports.default = 'function RSC() {}'

    if (pageRuntime === 'edge') {
      // Currently for the Edge runtime, we treat all RSC pages as SSR pages.
      rscExports.__N_SSP = 'true'
    } else {
      if (__N_SSP) {
        rscExports.__N_SSP = 'true'
      } else {
        // Server component pages are always considered as SSG by default because
        // the flight data is needed for client navigation.
        rscExports.__N_SSG = 'true'
      }
    }
  }

  const output = transformedSource + '\n' + buildExports(rscExports, isEsm)
  return output
}
