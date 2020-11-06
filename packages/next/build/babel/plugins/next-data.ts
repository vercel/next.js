import {
  NodePath,
  PluginObj,
  types as BabelTypes,
} from 'next/dist/compiled/babel/core'

export default function ({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj<any> {
  return {
    visitor: {
      ImportDeclaration(path: NodePath<BabelTypes.ImportDeclaration>, state) {
        const source = path.node.source.value
        if (source !== 'next/data') return

        const createHookSpecifier = path.get('specifiers').find((specifier) => {
          return (
            specifier.isImportSpecifier() &&
            (t.isIdentifier(specifier.node.imported)
              ? specifier.node.imported.name
              : specifier.node.imported.value) === 'createHook'
          )
        })

        if (!createHookSpecifier) return

        const bindingName = createHookSpecifier.node.local.name
        const binding = path.scope.getBinding(bindingName)

        if (!binding) {
          return
        }

        binding.referencePaths.forEach((refPath) => {
          let callExpression = refPath.parentPath

          if (!callExpression.isCallExpression()) return

          let args: any = callExpression.get('arguments')

          if (!args[0]) {
            throw callExpression.buildCodeFrameError(
              'first argument to createHook should be a function'
            )
          }

          if (!args[1]) {
            callExpression.node.arguments.push(t.objectExpression([]))
          }

          args = callExpression.get('arguments')

          args[1].node.properties.push(
            t.objectProperty(
              t.identifier('key'),
              t.stringLiteral(state.opts.key)
            )
          )
        })
      },
    },
  }
}
