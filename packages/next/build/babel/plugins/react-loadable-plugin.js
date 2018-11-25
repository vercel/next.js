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

export default function ({ types: t, template }) {
  return {
    visitor: {
      ImportDeclaration (path) {
        let source = path.node.source.value
        if (source !== 'next/dynamic') return

        let defaultSpecifier = path.get('specifiers').find(specifier => {
          return specifier.isImportDefaultSpecifier()
        })

        if (!defaultSpecifier) return

        let bindingName = defaultSpecifier.node.local.name
        let binding = path.scope.getBinding(bindingName)

        binding.referencePaths.forEach(refPath => {
          let callExpression = refPath.parentPath

          if (
            callExpression.isMemberExpression() &&
            callExpression.node.computed === false &&
            callExpression.get('property').isIdentifier({ name: 'Map' })
          ) {
            callExpression = callExpression.parentPath
          }

          if (!callExpression.isCallExpression()) return

          let args = callExpression.get('arguments')
          if (args.length > 2) throw callExpression.error

          let loader
          let options

          if (!args[0]) {
            return
          }

          if (args[0].isObjectExpression()) {
            options = args[0]
          } else {
            if (!args[1]) {
              callExpression.pushContainer('arguments', t.objectExpression([]))
            }
            // This is needed as the code is modified above
            args = callExpression.get('arguments')
            loader = args[0]
            options = args[1]
          }

          if (!options.isObjectExpression()) return

          let properties = options.get('properties')
          let propertiesMap = {}

          properties.forEach(property => {
            let key = property.get('key')
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

          let loaderMethod = loader
          let dynamicImports = []

          loaderMethod.traverse({
            Import (path) {
              dynamicImports.push(path.parentPath)
            }
          })

          if (!dynamicImports.length) return

          options.pushContainer(
            'properties',
            t.objectProperty(
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
                          [dynamicImport.get('arguments')[0].node]
                        )
                      })
                    )
                  )
                ),
                t.objectProperty(
                  t.identifier('modules'),
                  t.arrayExpression(
                    dynamicImports.map(dynamicImport => {
                      return dynamicImport.get('arguments')[0].node
                    })
                  )
                )
              ])
            )
          )

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
