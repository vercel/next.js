// TODO: add ts support for next-swc api
// @ts-ignore
import { parse } from '../../swc'
// @ts-ignore
import { getBaseSWCOptions } from '../../swc/options'
import { getRawPageExtensions } from '../../utils'

function isClientComponent(importSource: string, pageExtensions: string[]) {
  return new RegExp(`\\.client(\\.(${pageExtensions.join('|')}))?`).test(
    importSource
  )
}

function isServerComponent(importSource: string, pageExtensions: string[]) {
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

async function parseImportsInfo(
  resourcePath: string,
  source: string,
  imports: Array<string>,
  isClientCompilation: boolean,
  pageExtensions: string[]
): Promise<{
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
          if (
            !(
              isClientComponent(importSource, pageExtensions) ||
              isNextComponent(importSource) ||
              isImageImport(importSource)
            )
          ) {
            continue
          }
          const importDeclarations = source.substring(
            lastIndex,
            node.source.span.start - beginPos
          )
          transformedSource += importDeclarations
          transformedSource += JSON.stringify(`${node.source.value}?flight`)
        } else {
          // For the client compilation, we skip all modules imports but
          // always keep client components in the bundle. All client components
          // have to be imported from either server or client components.
          if (
            !(
              isClientComponent(importSource, pageExtensions) ||
              isServerComponent(importSource, pageExtensions) ||
              // Special cases for Next.js APIs that are considered as client
              // components:
              isNextComponent(importSource) ||
              isImageImport(importSource)
            )
          ) {
            continue
          }
        }

        lastIndex = node.source.span.end - beginPos
        imports.push(`require(${JSON.stringify(importSource)})`)
        continue
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
  const { client: isClientCompilation, pageExtensions: pageExtensionsJson } =
    this.getOptions()
  const { resourcePath } = this
  const pageExtensions = JSON.parse(pageExtensionsJson)

  if (typeof source !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  if (resourcePath.includes('/node_modules/')) {
    return source
  }

  const imports: string[] = []
  const { source: transformedSource, defaultExportName } =
    await parseImportsInfo(
      resourcePath,
      source,
      imports,
      isClientCompilation,
      getRawPageExtensions(pageExtensions)
    )

  /**
   * Server side component module output:
   *
   * export default function ServerComponent() { ... }
   * + export const __rsc_noop__=()=>{ ... }
   * + ServerComponent.__next_rsc__=1;
   *
   * Client side component module output:
   *
   * The function body of ServerComponent will be removed
   */

  const noop = `export const __rsc_noop__=()=>{${imports.join(';')}}`
  const defaultExportNoop = isClientCompilation
    ? `export default function ${defaultExportName}(){}\n${defaultExportName}.__next_rsc__=1;`
    : defaultExportName
    ? `${defaultExportName}.__next_rsc__=1;`
    : ''

  const transformed = transformedSource + '\n' + noop + '\n' + defaultExportNoop

  return transformed
}
