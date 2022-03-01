// TODO: add ts support for next-swc api
// @ts-ignore
import { parse } from '../../swc'
// @ts-ignore
import { getBaseSWCOptions } from '../../swc/options'
import { getRawPageExtensions } from '../../utils'

const getIsClientComponent =
  (pageExtensions: string[]) => (importSource: string) => {
    return new RegExp(`\\.client(\\.(${pageExtensions.join('|')}))?`).test(
      importSource
    )
  }

const getIsServerComponent =
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

export function isImageImport(importSource: string) {
  // TODO: share extension with next/image
  // TODO: add other static assets, jpeg -> jpg
  return ['jpg', 'jpeg', 'png', 'webp', 'avif'].some((imageExt) =>
    importSource.endsWith('.' + imageExt)
  )
}

async function parseImportsInfo({
  resourcePath,
  source,
  imports,
  isClientCompilation,
  isServerComponent,
  isClientComponent,
}: {
  resourcePath: string
  source: string
  imports: Array<string>
  isClientCompilation: boolean
  isServerComponent: (name: string) => boolean
  isClientComponent: (name: string) => boolean
}): Promise<{
  source: string
  defaultExportName: string
}> {
  const opts = getBaseSWCOptions({
    filename: resourcePath,
    globalWindow: isClientCompilation,
  })
  const ast = await parse(source, { ...opts.jsc.parser, isModule: true })
  const { body } = ast
  const beginPos = ast.span.start
  let transformedSource = ''
  let lastIndex = 0
  let defaultExportName
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
            node.source.span.start - beginPos
          )

          if (
            !(
              isClientComponent(importSource) ||
              isNextComponent(importSource) ||
              isImageImport(importSource)
            )
          ) {
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
          } else {
            // A client component. It should be loaded as module reference.
            transformedSource += importDeclarations
            transformedSource += JSON.stringify(`${importSource}?__sc_client__`)
            imports.push(`require(${JSON.stringify(importSource)})`)
          }
        } else {
          // For the client compilation, we skip all modules imports but
          // always keep client components in the bundle. All client components
          // have to be imported from either server or client components.
          if (
            !(
              isClientComponent(importSource) ||
              isServerComponent(importSource) ||
              // Special cases for Next.js APIs that are considered as client
              // components:
              isNextComponent(importSource) ||
              isImageImport(importSource)
            )
          ) {
            continue
          }

          imports.push(`require(${JSON.stringify(importSource)})`)
        }

        lastIndex = node.source.span.end - beginPos
        break
      }
      case 'ExportDefaultDeclaration': {
        const def = node.decl
        if (def.type === 'Identifier') {
          defaultExportName = def.name
        } else if (def.type === 'FunctionExpression') {
          defaultExportName = def.identifier.value
        }
        break
      }
      case 'ExportDefaultExpression':
        const exp = node.expression
        if (exp.type === 'Identifier') {
          defaultExportName = exp.value
        }
        break
      default:
        break
    }
  }

  if (!isClientCompilation) {
    transformedSource += source.substring(lastIndex)
  }

  return { source: transformedSource, defaultExportName }
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
  const isServerComponent = getIsServerComponent(rawRawPageExtensions)
  const isClientComponent = getIsClientComponent(rawRawPageExtensions)

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

  const imports: string[] = []
  const { source: transformedSource, defaultExportName } =
    await parseImportsInfo({
      resourcePath,
      source,
      imports,
      isClientCompilation,
      isServerComponent,
      isClientComponent,
    })

  /**
   * For .server.js files, we handle this loader differently.
   *
   * Server compilation output:
   *   export default function ServerComponent() { ... }
   *   export const __rsc_noop__ = () => { ... }
   *   ServerComponent.__next_rsc__ = 1
   *   ServerComponent.__webpack_require__ = __webpack_require__
   *
   * Client compilation output:
   *   The function body of Server Component will be removed
   */

  const noop = `export const __rsc_noop__=()=>{${imports.join(';')}}`

  let defaultExportNoop = ''
  if (isClientCompilation) {
    defaultExportNoop = `export default function ${
      defaultExportName || 'ServerComponent'
    }(){}\n${defaultExportName || 'ServerComponent'}.__next_rsc__=1;`
  } else {
    if (defaultExportName) {
      // It's required to have the default export for pages. For other components, it's fine to leave it as is.
      defaultExportNoop = `${defaultExportName}.__next_rsc__=1;${defaultExportName}.__webpack_require__=__webpack_require__;`
    }
  }

  const transformed = transformedSource + '\n' + noop + '\n' + defaultExportNoop
  return transformed
}
