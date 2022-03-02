// TODO: add ts support for next-swc api
// @ts-ignore
import { parse } from '../../swc'
// @ts-ignore
import { getBaseSWCOptions } from '../../swc/options'
import { getRawPageExtensions } from '../../utils'

const createClientComponentFilter =
  (pageExtensions: string[]) => (importSource: string) => {
    const hasClientExtension = new RegExp(
      `\\.client(\\.(${pageExtensions.join('|')}))?`
    ).test(importSource)
    // Special cases for Next.js APIs that are considered as client components:
    return (
      hasClientExtension ||
      isNextComponent(importSource) ||
      isImageImport(importSource)
    )
  }

const createServerComponentFilter =
  (pageExtensions: string[]) => (importSource: string) => {
    return new RegExp(`\\.server(\\.(${pageExtensions.join('|')}))?`).test(
      importSource
    )
  }

function isNextComponent(importSource: string) {
  return (
    importSource.includes('next/link') || importSource.includes('next/image')
  )
}

function isImageImport(importSource: string) {
  // TODO: share extension with next/image
  // TODO: add other static assets, jpeg -> jpg
  return ['jpg', 'jpeg', 'png', 'webp', 'avif'].some((imageExt) =>
    importSource.endsWith('.' + imageExt)
  )
}

async function parseImportsInfo({
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
}> {
  const opts = getBaseSWCOptions({
    filename: resourcePath,
    globalWindow: isClientCompilation,
  })
  const ast = await parse(source, { ...opts.jsc.parser, isModule: true })
  const { body } = ast

  let transformedSource = ''
  let lastIndex = 0
  let imports = ''

  for (let i = 0; i < body.length; i++) {
    const node = body[i]
    switch (node.type) {
      case 'ImportDeclaration': {
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
            imports += `require(${JSON.stringify(importSource)});`
          } else {
            // This is a special case to avoid the Duplicate React error.
            // Since we already include React in the SSR runtime,
            // here we can't create a new module with the ?__rsc_server__ query.
            if (
              ['react/jsx-runtime', 'react/jsx-dev-runtime'].includes(
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

          imports += `require(${JSON.stringify(importSource)});`
        }

        lastIndex = node.source.span.end
        break
      }
      default:
        break
    }
  }

  if (!isClientCompilation) {
    transformedSource += source.substring(lastIndex)
  }

  return { source: transformedSource, imports }
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

  const { source: transformedSource, imports } = await parseImportsInfo({
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

  let rscExports = `export const __next_rsc__={
    __webpack_require__,
    _: () => {${imports}}
  }`

  if (isClientCompilation) {
    rscExports += '\nexport default function RSC () {}'
  }

  return transformedSource + '\n' + rscExports
}
