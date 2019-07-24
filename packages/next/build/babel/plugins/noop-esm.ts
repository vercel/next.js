import { PluginObj } from '@babel/core'

// The purpose of this plugin is to remove the `esm` package from being bundled
// by webpack. `esm` is not compatible or relevant with a webpack world.
//
// Reasoning:
// https://github.com/webpack/webpack/issues/4742
// https://github.com/zeit/next.js/pull/8081

export default function NoopEsmPatcher(): PluginObj {
  return {
    visitor: {
      CallExpression(path) {
        const { callee } = path.node
        if (callee.type === 'Identifier' && callee.name === 'require') {
          const arg = path.node.arguments[0]
          if (arg && arg.type === 'StringLiteral' && arg.value === 'esm') {
            path.getStatementParent().remove()
          }
        }
      },
    },
  }
}
