import { parse } from '../../swc'
import { getRawPageExtensions } from '../../utils'
import { buildExports } from './utils'

const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif']

const createClientComponentFilter = (pageExtensions: string[]) => {
  // Special cases for Next.js APIs that are considered as client components:
  // - .client.[ext]
  // - next/link, next/image
  // - .[imageExt]
  const regex = new RegExp(
    '(' +
      `\\.client(\\.(${pageExtensions.join('|')}))?|` +
      `next/link|next/image|` +
      `\\.(${imageExtensions.join('|')})` +
      ')$'
  )

  return (importSource: string) => regex.test(importSource)
}

const createServerComponentFilter = (pageExtensions: string[]) => {
  const regex = new RegExp(`\\.server(\\.(${pageExtensions.join('|')}))?$`)
  return (importSource: string) => regex.test(importSource)
}

async function parseModuleInfo({
  resourcePath,
  source,
  isClientCompilation,
  isServerComponent,
  isClientComponent,
}: {
  resourcePath: string
  source: string
  isClientCompilation: boolean
  isServerComponent: (name: string) => boolean
  isClientComponent: (name: string) => boolean
}): Promise<{
  source: string
  imports: string
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
  let imports = ''
  let __N_SSP = false
  let pageRuntime = null

  const isEsm = type === 'Module'

  for (let i = 0; i < body.length; i++) {
    const node = body[i]
    switch (node.type) {
      case 'ImportDeclaration':
        const importSource = node.source.value
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
            // A client component. It should be loaded as module reference.
            transformedSource += importDeclarations
            transformedSource += JSON.stringify(`${importSource}?__sc_client__`)
            imports += `require(${JSON.stringify(importSource)})\n`
          } else {
            // FIXME
            // case: 'react'
            // Avoid module resolution error like Cannot find `./?__rsc_server__` in react/package.json

            // cases: 'react/jsx-runtime', 'react/jsx-dev-runtime'
            // This is a special case to avoid the Duplicate React error.
            // Since we already include React in the SSR runtime,
            // here we can't create a new module with the ?__rsc_server__ query.
            if (
              ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'].includes(
                importSource
              )
            ) {
              continue
            }

            // A shared component. It should be handled as a server
            // component.
            transformedSource += importDeclarations
            transformedSource += JSON.stringify(`${importSource}?__sc_server__`)
          }
        } else {
          // For the client compilation, we skip all modules imports but
          // always keep client components in the bundle. All client components
          // have to be imported from either server or client components.
          if (
            !(
              isClientComponent(importSource) || isServerComponent(importSource)
            )
          ) {
            continue
          }

          imports += `require(${JSON.stringify(importSource)})\n`
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
  const { client: isClientCompilation, pageExtensions } = this.getOptions()
  const { resourcePath, resourceQuery } = this

  if (typeof source !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  // We currently assume that all components are shared components (unsuffixed)
  // from node_modules.
  if (resourcePath.includes('/node_modules/')) {
    return source
  }

  const rawRawPageExtensions = getRawPageExtensions(pageExtensions)
  const isServerComponent = createServerComponentFilter(rawRawPageExtensions)
  const isClientComponent = createClientComponentFilter(rawRawPageExtensions)

  if (!isClientCompilation) {
    // We only apply the loader to server components, or shared components that
    // are imported by a server component.
    if (
      !isServerComponent(resourcePath) &&
      resourceQuery !== '?__sc_server__'
    ) {
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
  })

  /**
   * For .server.js files, we handle this loader differently.
   *
   * Server compilation output:
   *   (The content of the Server Component module will be kept.)
   *   export const __next_rsc__ = { __webpack_require__, _: () => { ... } }
   *
   * Client compilation output:
   *   (The content of the Server Component module will be removed.)
   *   export const __next_rsc__ = { __webpack_require__, _: () => { ... } }
   */

  const rscExports: any = {
    __next_rsc__: `{
      __webpack_require__,
      _: () => {\n${imports}\n}
    }`,
    __next_rsc_server__: isServerComponent(resourcePath) ? 'true' : 'false',
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
