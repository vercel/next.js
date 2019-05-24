/**
COPYRIGHT (c) 2017-present James Kyle <me@thejameskyle.com>
 MIT License
 Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:
 The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWAR
*/
// This file is https://github.com/jamiebuilds/react-loadable/blob/master/src/babel.js
// Modified to also look for `next/dynamic`
// Modified to put `webpack` and `modules` under `loadableGenerated` to be backwards compatible with next/dynamic which has a `modules` key
// Modified to support `dynamic(import('something'))` and `dynamic(import('something'), options)

import {PluginObj} from '@babel/core'
import {NodePath} from '@babel/traverse'
import * as BabelTypes from '@babel/types'

export default function ({ types: t }: {types: typeof BabelTypes}): PluginObj {
  return {
    visitor: {
      ImportDeclaration (path: NodePath<BabelTypes.ImportDeclaration>) {
        let source = path.node.source.value
        if (source !== 'next/dynamic') return

        let defaultSpecifier = path.get('specifiers').find(specifier => {
          return specifier.isImportDefaultSpecifier()
        })

        if (!defaultSpecifier) return

        const bindingName = defaultSpecifier.node.local.name
        const binding = path.scope.getBinding(bindingName)

        if (!binding) {
          return
        }

        binding.referencePaths.forEach(refPath => {
          let callExpression = refPath.parentPath

          if (
            callExpression.isMemberExpression() &&
            callExpression.node.computed === false
          ) {
            const property = callExpression.get('property')
            if (!Array.isArray(property) && property.isIdentifier({ name: 'Map' })) {
              callExpression = callExpression.parentPath
            }
          }

          if (!callExpression.isCallExpression()) return

          let args = callExpression.get('arguments')
          if (args.length > 2) {
            throw callExpression.buildCodeFrameError('next/dynamic only accepts 2 arguments')
          }

          if (!args[0]) {
            return
          }

          let loader
          let options

          if (args[0].isObjectExpression()) {
            options = args[0]
          } else {
            if (!args[1]) {
              callExpression.node.arguments.push(t.objectExpression([]))
            }
            // This is needed as the code is modified above
            // TODO: remove ignore statement
            // @ts-ignore
            args = callExpression.get('arguments')
            loader = args[0]
            options = args[1]
          }

          if (!options.isObjectExpression()) return

          let properties = options.get('properties')
          let propertiesMap: {[key: string]: NodePath<BabelTypes.ObjectProperty | BabelTypes.ObjectMethod | BabelTypes.SpreadProperty>} = {}

          properties.forEach(property => {
            const key: any = property.get('key')
            propertiesMap[key.node.name] = property
          })

          if (propertiesMap.loadableGenerated) {
            return
          }

          if (propertiesMap.loader) {
            loader = propertiesMap.loader.get('value')
          }

          if (propertiesMap.modules) {
            loader = propertiesMap.modules.get('value')
          }

          if (!loader || Array.isArray(loader)) {
            return
          }
          const dynamicImports: BabelTypes.StringLiteral[] = []

          loader.traverse({
            Import (path) {
              const args = path.parentPath.get('arguments')
              if (!Array.isArray(args)) return
              const node: any = args[0].node
              dynamicImports.push(node)
            }
          })

          if (!dynamicImports.length) return

          options.node.properties.push(t.objectProperty(
            t.identifier('loadableGenerated'),
            t.objectExpression([
              t.objectProperty(
                t.identifier('webpack'),
                t.arrowFunctionExpression(
                  [],
                  t.arrayExpression(
                    dynamicImports.map(dynamicImport => {
                      return t.callExpression(
                        t.memberExpression(
                          t.identifier('require'),
                          t.identifier('resolveWeak')
                        ),
                        [dynamicImport]
                      )
                    })
                  )
                )
              ),
              t.objectProperty(
                t.identifier('modules'),
                t.arrayExpression(
                  dynamicImports
                )
              )
            ])
          ))

          // Turns `dynamic(import('something'))` into `dynamic(() => import('something'))` for backwards compat.
          // This is the replicate the behavior in versions below Next.js 7 where we magically handled not executing the `import()` too.
          // We'll deprecate this behavior and provide a codemod for it in 7.1.
          if (loader.isCallExpression()) {
            const arrowFunction = t.arrowFunctionExpression([], loader.node)
            loader.replaceWith(arrowFunction)
          }
        })
      }
    }
  }
}
