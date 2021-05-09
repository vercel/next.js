import nodePath from 'path'
import { API, FileInfo, Options } from 'jscodeshift'

export const globalCssImports = new Set<string>()

const globalStylesRegex = /(?<!\.module)\.(css|scss|sass)$/i

export default function transformer(
  file: FileInfo,
  api: API,
  options: Options
) {
  const j = api.jscodeshift
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

      if (typeof value === 'string' && globalStylesRegex.test(value)) {
        const resolvedPath = nodePath.resolve(
          nodePath.dirname(file.path),
          value
        )
        globalCssImports.add(resolvedPath)

        const { start, end } = path.node as any

        if (!path.parentPath.node.comments) {
          path.parentPath.node.comments = []
        }

        path.parentPath.node.comments = [
          j.commentLine(' ' + file.source.substring(start, end)),
        ]
        hasModifications = true
        return true
      }
      return false
    })
    .remove()

  return hasModifications ? root.toSource(options) : null
}
