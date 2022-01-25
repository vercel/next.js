import * as acorn from 'next/dist/compiled/acorn'
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
  source: string,
  imports: Array<string>,
  isClientCompilation: boolean,
  pageExtensions: string[]
): Promise<{
  source: string
  defaultExportName: string
}> {
  const { body } = acorn.parse(source, {
    ecmaVersion: 11,
    sourceType: 'module',
  }) as any

  let transformedSource = ''
  let lastIndex = 0
  let defaultExportName = 'RSCComponent'

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
          transformedSource += source.substring(
            lastIndex,
            node.source.start - 1
          )
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

        lastIndex = node.source.end
        imports.push(`require(${JSON.stringify(importSource)})`)
        continue
      }
      case 'ExportDefaultDeclaration': {
        const def = node.declaration
        if (def.type === 'Identifier') {
          defaultExportName = def.name
        } else if (def.type === 'FunctionDeclaration') {
          defaultExportName = def.id.name
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
    : `${defaultExportName}.__next_rsc__=1;`

  const transformed = transformedSource + '\n' + noop + '\n' + defaultExportNoop

  return transformed
}
