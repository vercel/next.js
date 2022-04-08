import { parse } from '../../swc'
import { buildExports } from './utils'

const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif']

export const createClientComponentFilter = (extensions: string[]) => {
  // Special cases for Next.js APIs that are considered as client components:
  // - .client.[ext]
  // - next built-in client components
  // - .[imageExt]
  const regex = new RegExp(
    '(' +
      `\\.client(\\.(${extensions.join('|')}))?|` +
      `next/(link|image)(\\.js)?|` +
      `\\.(${imageExtensions.join('|')})` +
      ')$'
  )

  return (importSource: string) => regex.test(importSource)
}

export const createServerComponentFilter = (extensions: string[]) => {
  const regex = new RegExp(`\\.server(\\.(${extensions.join('|')}))?$`)
  return (importSource: string) => regex.test(importSource)
}

function createFlightServerRequest(request: string, extensions: string[]) {
  return `next-flight-server-loader?${JSON.stringify({
    extensions,
  })}!${request}`
}

function hasFlightLoader(request: string, type: 'client' | 'server') {
  return request.includes(`next-flight-${type}-loader`)
}

async function parseModuleInfo({
  resourcePath,
  source,
  extensions,
  isClientCompilation,
  isServerComponent,
  isClientComponent,
  resolver,
}: {
  resourcePath: string
  source: string
  isClientCompilation: boolean
  extensions: string[]
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
  let transformedSource = ''
  let lastIndex = 0
  let imports = []
  let __N_SSP = false
  let pageRuntime = null

  const isEsm = type === 'Module'

  for (let i = 0; i < body.length; i++) {
    const node = body[i]
    switch (node.type) {
      case 'ImportDeclaration':
        const importSource = node.source.value
        const resolvedPath = await resolver(importSource)
        const isNodeModuleImport = resolvedPath.includes('/node_modules/')

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
            node.source.span.start
          )

          if (isClientComponent(importSource)) {
            transformedSource += importDeclarations
            transformedSource += JSON.stringify(
              `next-flight-client-loader!${importSource}`
            )
            imports.push(importSource)
          } else {
            // A shared component. It should be handled as a server component.
            const serverImportSource = isReactImports
              ? importSource
              : createFlightServerRequest(importSource, extensions)
            transformedSource += importDeclarations
            transformedSource += JSON.stringify(serverImportSource)

            // TODO: support handling RSC components from node_modules
            if (!isNodeModuleImport) {
              imports.push(importSource)
            }
          }
        } else {
          // For the client compilation, we skip all modules imports but
          // always keep client/shared components in the bundle. All client components
          // have to be imported from either server or client components.
          if (
            isServerComponent(importSource) ||
            hasFlightLoader(importSource, 'server') ||
            // TODO: support handling RSC components from node_modules
            isNodeModuleImport
          ) {
            continue
          }
          imports.push(importSource)
        }

        lastIndex = node.source.span.end
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
  const { client: isClientCompilation, extensions } = this.getOptions()
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

  const isServerComponent = createServerComponentFilter(extensions)
  const isClientComponent = createClientComponentFilter(extensions)
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
    extensions,
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
