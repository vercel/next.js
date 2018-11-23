export default function ({ types: t }) {
  return {
    visitor: {
      JSXOpeningElement: {
        enter (path, { file }) {
          file.set('hasJSX', true)
        }
      },

      Program: {
        enter (path, { file }) {
          file.set('hasJSX', false)
        },

        exit ({ node, scope }, { file }) {
          if (!file.get('hasJSX') || scope.hasBinding('React')) {
            return
          }

          // Secondary scan to check for plugins that do similar injection.
          const reactImport = node.body.find(child => {
            if (child.type === 'ImportDeclaration') {
              const { specifiers } = child
              return specifiers.find(({ type, local }) => type === 'ImportDefaultSpecifier' && local.name === 'React')
            }
          })
          if (reactImport) {
            return
          }

          const reactImportDeclaration = t.importDeclaration([
            t.importDefaultSpecifier(t.identifier('React'))
          ], t.stringLiteral('react'))

          node.body.unshift(reactImportDeclaration)
        }
      }
    }
  }
}
