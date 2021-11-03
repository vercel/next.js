import * as acorn from 'acorn'
import { getRawPageExtensions } from '../../utils'

function isClientComponent(importSource: string, pageExtensions: string[]) {
  return new RegExp(`\\.client(\\.(${pageExtensions.join('|')}))?`).test(
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
): Promise<string> {
  const { body } = acorn.parse(source, {
    ecmaVersion: 2019,
    sourceType: 'module',
  }) as any

  let transformedSource = ''
  let lastIndex = 0

  for (let i = 0; i < body.length; i++) {
    const node = body[i]
    switch (node.type) {
      case 'ImportDeclaration':
        // When importing from a server component, ignore
        const importSource = node.source.value

        // For the client compilation, we have to always import the component to
        // ensure that all dependencies are tracked.
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
          transformedSource += source.substr(
            lastIndex,
            node.source.start - lastIndex
          )
          transformedSource += JSON.stringify(`${node.source.value}?flight`)
        }

        lastIndex = node.source.end
        imports.push(`require(${JSON.stringify(importSource)})`)
        continue
      default:
        break
    }
  }

  if (!isClientCompilation) {
    transformedSource += source.substr(lastIndex)
  }

  return transformedSource
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
  const transformed = await parseImportsInfo(
    source,
    imports,
    isClientCompilation,
    getRawPageExtensions(pageExtensions)
  )

  const noop = `\nexport const __rsc_noop__=()=>{${imports.join(';')}}`
  const defaultExportNoop = isClientCompilation
    ? `\nexport default function Comp(){}\nComp.__next_rsc__=1`
    : ''

  return transformed + noop + defaultExportNoop
}
