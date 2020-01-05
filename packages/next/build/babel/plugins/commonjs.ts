import { NodePath, PluginObj } from '@babel/core'
import commonjsPlugin from '@babel/plugin-transform-modules-commonjs'
import { Program } from '@babel/types'

// Rewrite imports using next/<something> to next-server/<something>
export default function NextToNextServer(...args: any): PluginObj {
  const commonjs = commonjsPlugin(...args)
  return {
    visitor: {
      Program: {
        exit(path: NodePath<Program>, state) {
          let foundModuleExports = false
          path.traverse({
            MemberExpression(path: any) {
              if (path.node.object.name !== 'module') return
              if (path.node.property.name !== 'exports') return
              foundModuleExports = true
            },
          })

          if (!foundModuleExports) {
            return
          }

          commonjs.visitor.Program.exit.call(this, path, state)
        },
      },
    },
  }
}
