import { parse } from '../../swc'
import { getRawPageExtensions } from '../../utils'

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
  const ast = await parse(source, { filename: resourcePath, isModule: true })
  const { body } = ast
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
            node.source.span.start
          )

          if (isClientComponent(importSource)) {
            // A client component. It should be loaded as module reference.
            transformedSource += importDeclarations
            transformedSource += JSON.stringify(`${importSource}?__sc_client__`)
            imports.push(`require(${JSON.stringify(importSource)})`)
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

          imports.push(`require(${JSON.stringify(importSource)})`)
        }

        lastIndex = node.source.span.end
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
