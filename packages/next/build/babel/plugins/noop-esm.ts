import { PluginObj } from '@babel/core'

// The purpose of this plugin is to remove the `esm` package from being bundled
// by webpack. `esm` is not compatible or relevant with a webpack world.
//
// Reasoning:
// https://github.com/webpack/webpack/issues/4742
//
// tl;dr:
//
// `const bla require('esm-module')` is not the same as:
// `import bla from 'esm-module'` -- it's equivalent to:
// `import * as bla from 'esm-module`.
// This means CJS packages cannot consume ESM-enabled variants of CJS modules,
// "magically". i.e. we cannot resolve the `module` key first. This is not a
// problem for webpack though, because it understands ESM natively unlike Node.

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
