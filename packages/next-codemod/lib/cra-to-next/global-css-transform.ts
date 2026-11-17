import nodePath from 'path'
import type { API, FileInfo, Options } from 'jscodeshift'
import { createParserFromPath } from '../parser'

export const globalCssContext = {
  cssImports: new Set<string>(),
  reactSvgImports: new Set<string>(),
}
const globalStylesRegex = /(?<!\.module)\.(css|scss|sass)$/i

export default function transformer(
  file: FileInfo,
  _api: API,
  options: Options
) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)
  let hasModifications = false

  root
    .find(j.ImportDeclaration)
    .filter((path) => {
      const {
        node: {
          source: { value },
        },
      } = path

      if (typeof value === 'string') {
        if (globalStylesRegex.test(value)) {
          let resolvedPath = value

          if (value.startsWith('.')) {
            resolvedPath = nodePath.resolve(nodePath.dirname(file.path), value)
          }
          globalCssContext.cssImports.add(resolvedPath)

          // TODO(as-any): pre-existing cast, not yet reviewed
          // eslint-disable-next-line @next/internal/no-as-any
          const { start, end } = path.node as any

          if (!path.parentPath.node.comments) {
            path.parentPath.node.comments = []
          }

          path.parentPath.node.comments = [
            j.commentLine(' ' + file.source.substring(start, end)),
          ]
          hasModifications = true
          return true
        } else if (value.endsWith('.svg')) {
          const isComponentImport = path.node.specifiers.some((specifier) => {
            // TODO(as-any): pre-existing cast, not yet reviewed
            // eslint-disable-next-line @next/internal/no-as-any
            return (specifier as any).imported?.name === 'ReactComponent'
          })

          if (isComponentImport) {
            globalCssContext.reactSvgImports.add(file.path)
          }
        }
      }
      return false
    })
    .remove()

  return hasModifications && globalCssContext.reactSvgImports.size === 0
    ? root.toSource(options)
    : null
}
