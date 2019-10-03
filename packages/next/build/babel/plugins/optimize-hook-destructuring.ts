import { PluginObj } from '@babel/core'
import { NodePath } from '@babel/traverse'
import * as BabelTypes from '@babel/types'

// matches any hook-like (the default)
const isHook = /^use[A-Z]/

// matches only built-in hooks provided by React et al
const isBuiltInHook = /^use(Callback|Context|DebugValue|Effect|ImperativeHandle|LayoutEffect|Memo|Reducer|Ref|State)$/

export default function({
  types: t,
}: {
  types: typeof BabelTypes
}): PluginObj<any> {
  const visitor = {
    CallExpression(path: NodePath<BabelTypes.CallExpression>, state: any) {
      const onlyBuiltIns = state.opts.onlyBuiltIns

      // if specified, options.lib is a list of libraries that provide hook functions
      const libs =
        state.opts.lib &&
        (state.opts.lib === true
          ? ['react', 'preact/hooks']
          : [].concat(state.opts.lib))

      // skip function calls that are not the init of a variable declaration:
      if (!t.isVariableDeclarator(path.parent)) return

      // skip function calls where the return value is not Array-destructured:
      if (!t.isArrayPattern(path.parent.id)) return

      // name of the (hook) function being called:
      const hookName = (path.node.callee as BabelTypes.Identifier).name

      if (libs) {
        const binding = path.scope.getBinding(hookName)
        // not an import
        if (!binding || binding.kind !== 'module') return

        const specifier = (binding.path.parent as BabelTypes.ImportDeclaration)
          .source.value
        // not a match
        if (!libs.some(lib => lib === specifier)) return
      }

      // only match function calls with names that look like a hook
      if (!(onlyBuiltIns ? isBuiltInHook : isHook).test(hookName)) return

      path.parent.id = t.objectPattern(
        path.parent.id.elements.reduce<Array<BabelTypes.ObjectProperty>>(
          (patterns, element, i) => {
            if (element === null) {
              return patterns
            }

            return patterns.concat(
              t.objectProperty(t.numericLiteral(i), element)
            )
          },
          []
        )
      )
    },
  }

  return {
    name: 'optimize-hook-destructuring',
    visitor: {
      // this is a workaround to run before preset-env destroys destructured assignments
      Program(path, state) {
        path.traverse(visitor, state)
      },
    },
  }
}
