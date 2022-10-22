import type {
  API,
  Collection,
  FileInfo,
  JSCodeshift,
  Options,
} from 'jscodeshift'

function defaultExportFuncAndFirstParam(root: Collection<any>, j: JSCodeshift) {
  const defaultExport = root.find(j.ExportDefaultDeclaration)

  /**
   * export default function handler(req) {}
   */
  const funcDec = defaultExport.find(j.FunctionDeclaration)
  if (funcDec.length) {
    return { paramName: funcDec.get('params', 0).value.name, func: funcDec }
  }

  /**
   * function handle(req) {}
   * export default handle
   */
  const funcDec2 = root.find(j.FunctionDeclaration, {
    id: { name: defaultExport.find(j.Identifier).get('name').value },
  })
  if (funcDec2.length) {
    return { paramName: funcDec2.get('params', 0).value.name, func: funcDec2 }
  }

  /**
   * const handle = (req) => {} OR const handle = function (req) {}
   * export default handle
   */
  const varDec = root
    .find(j.VariableDeclarator, {
      id: { name: defaultExport.find(j.Identifier).get('name').value },
    })
    .find(j.Identifier)
  if (varDec.length) {
    return { paramName: varDec.get('name').value, func: varDec }
  }

  throw new Error('Could not find `NextRequest` parameter name')
}

export default function transformer(
  file: FileInfo,
  api: API,
  options: Options
) {
  const j = api.jscodeshift
  const root = j(file.source)

  const { func } = defaultExportFuncAndFirstParam(root, j)

  // Replace `.get()` with `.get()?.value`
  func
    // TODO: Only look for `get` calls on `req.cookies`
    .find(j.CallExpression, { callee: { property: { name: 'get' } } })
    .forEach((exp) => {
      const parentNode = exp.parentPath.value

      const optionalValue = j.identifier('value')
      if (Array.isArray(parentNode)) {
        // console.log(parentNode[0])
        // parentNode[0].callee = j.optionalMemberExpression(
        //   parentNode[0].callee,
        //   optionalValue
        // )
      } else if (parentNode.type === 'ExpressionStatement') {
        parentNode.expression = j.optionalMemberExpression(
          parentNode.expression,
          optionalValue
        )
      } else if (parentNode.type === 'VariableDeclarator') {
        parentNode.init = j.optionalMemberExpression(
          parentNode.init,
          optionalValue
        )
      }
    })

  // Rename `.getWithOptions()` to `.get()`
  func
    .find(j.BlockStatement)
    .find(j.Identifier, { name: 'getWithOptions' })
    .forEach((identifier) => (identifier.node.name = 'get'))

  return root.toSource(options)
}
