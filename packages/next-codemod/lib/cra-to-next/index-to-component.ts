import type { API, FileInfo, JSXElement, Options } from 'jscodeshift'
import { createParserFromPath } from '../parser'

export const indexContext = {
  multipleRenderRoots: false,
  nestedRender: false,
}

export default function transformer(
  file: FileInfo,
  _api: API,
  options: Options
) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)
  let hasModifications = false
  let foundReactRender = 0
  let hasRenderImport = false
  let defaultReactDomImport: string | undefined

  root.find(j.ImportDeclaration).forEach((path) => {
    if (path.node.source.value === 'react-dom') {
      return path.node.specifiers.forEach((specifier) => {
        if (specifier.local.name === 'render') {
          hasRenderImport = true
        }
        if (specifier.type === 'ImportDefaultSpecifier') {
          defaultReactDomImport = specifier.local.name
        }
      })
    }
    return false
  })

  root
    .find(j.CallExpression)
    .filter((path) => {
      const { node } = path
      let found = false

      if (
        defaultReactDomImport &&
        node.callee.type === 'MemberExpression' &&
        (node.callee.object as any).name === defaultReactDomImport &&
        (node.callee.property as any).name === 'render'
      ) {
        found = true
      }

      if (hasRenderImport && (node.callee as any).name === 'render') {
        found = true
      }

      if (found) {
        foundReactRender++
        hasModifications = true

        if (!Array.isArray(path.parentPath?.parentPath?.value)) {
          indexContext.nestedRender = true
          return false
        }

        const newNode = j.exportDefaultDeclaration(
          j.functionDeclaration(
            j.identifier('NextIndexWrapper'),
            [],
            j.blockStatement([
              j.returnStatement(
                // TODO: remove React.StrictMode wrapper and use
                // next.config.js option instead?
                path.node.arguments.find(
                  (a) => a.type === 'JSXElement'
                ) as JSXElement
              ),
            ])
          )
        )

        path.parentPath.insertBefore(newNode)
        return true
      }
      return false
    })
    .remove()

  indexContext.multipleRenderRoots = foundReactRender > 1
  hasModifications =
    hasModifications &&
    !indexContext.nestedRender &&
    !indexContext.multipleRenderRoots

  // TODO: move function passed to reportWebVitals if present to
  // _app reportWebVitals and massage values to expected shape

  // root.find(j.CallExpression, {
  //   callee: {
  //     name: 'reportWebVitals'
  //   }
  // }).remove()

  return hasModifications ? root.toSource(options) : null
}
