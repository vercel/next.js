import { NodePath, PluginObj, types as BabelTypes } from '@babel/core'

export default function removeUselessGetInitialProps({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj<any> {
  return {
    visitor: {
      ClassMethod(path: NodePath<BabelTypes.ClassMethod>, state) {
        const { filename } = state.file.opts
        /**
         * We should check that we are in _app file context and that we enter into getInitialProps method
         */
        if (
          filename.indexOf('_app') !== -1 &&
          t.isIdentifier(path.node.key) &&
          path.node.key.name === 'getInitialProps'
        ) {
          if (t.isBlockStatement(path.node.body)) {
            const { body } = path.node.body
            /**
             * The getInitialProps that we want to remove has three "blocks"
             * a `pageProps` declaration
             * an IfStatementBlock with an assignment of Component.getInitialProps to pageProps
             * A ReturnStatement with { pageProps }
             */
            if (body && body.length === 3) {
              if (
                t.isVariableDeclaration(body[0]) &&
                t.isIfStatement(body[1]) &&
                t.isReturnStatement(body[2])
              ) {
                const ifBlockConsequent = body[1].consequent
                if (
                  t.isBlockStatement(ifBlockConsequent) &&
                  ifBlockConsequent.body.length === 1
                ) {
                  const ifBlockBody = ifBlockConsequent.body[0]
                  const callee =
                    t.isExpressionStatement(ifBlockBody) &&
                    t.isAssignmentExpression(ifBlockBody.expression) &&
                    t.isAwaitExpression(ifBlockBody.expression.right) &&
                    t.isCallExpression(ifBlockBody.expression.right.argument)
                      ? ifBlockBody.expression.right.argument.callee
                      : null
                  if (
                    callee &&
                    t.isMemberExpression(callee) &&
                    t.isIdentifier(callee.object) &&
                    callee.object.name === 'Component' &&
                    callee.property.name === 'getInitialProps'
                  ) {
                    path.remove()
                  }
                }
              }
            }
          }
        }
      },
    },
  }
}
