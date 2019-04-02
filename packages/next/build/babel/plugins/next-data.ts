import {PluginObj} from '@babel/core'
import {NodePath} from '@babel/traverse'
import * as BabelTypes from '@babel/types'


export default function ({ types: t }: {types: typeof BabelTypes}): PluginObj {
  return {
    visitor: {
      ImportDeclaration (path: NodePath<BabelTypes.ImportDeclaration>, state) {
        const source = path.node.source.value
        if (source !== 'next/data') return

        const createHookSpecifier = path.get('specifiers').find(specifier => {
          return specifier.isImportSpecifier() && specifier.node.imported.name === 'createHook'
        })

        if (!createHookSpecifier) return

        const bindingName = createHookSpecifier.node.local.name
        const binding = path.scope.getBinding(bindingName)

        if (!binding) {
          return
        }

        binding.referencePaths.forEach(refPath => {
          let callExpression = refPath.parentPath

          if (!callExpression.isCallExpression()) return
          
          let args: any = callExpression.get('arguments')
          
          if (!args[0]) {
            throw callExpression.buildCodeFrameError('first argument to createHook should be a function') 
          }          
          
          if (!args[1]) {
            callExpression.node.arguments.push(t.objectExpression([]))
          }
          
          args = callExpression.get('arguments')

          args[1].node.properties.push(t.objectProperty(
            t.identifier('key'),
            t.stringLiteral(state.opts.key)
          ))
        })
      }
    }
  }
}
