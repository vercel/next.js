// This file is https://github.com/jamiebuilds/react-loadable/blob/master/src/babel.js
// Modified to also look for `next/dynamic`
// Modified to put `webpack` and `modules` under `loadableGenerated` to be backwards compatible with next/dynamic which has a `modules` key
// Modified to support `dynamic(import('something'))` and `dynamic(import('something'), options)
export default function ({ types: t, template }) {
  return {
    visitor: {
      ImportDeclaration (path) {
        let source = path.node.source.value
        if (source !== 'next/dynamic' && source !== 'react-loadable') return

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

          if (args[0].isCallExpression()) {
            if (!args[1]) {
              callExpression.pushContainer('arguments', t.objectExpression([]))
            }
            args = callExpression.get('arguments')
            loader = args[0]
            options = args[1]
          } else {
            options = args[0]
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
        })
      }
    }
  }
}
