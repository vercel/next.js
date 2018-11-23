export default function ({ types: t }) {
  return {
    visitor: {
      JSXOpeningElement (path, { file }) {
        file.set('hasJSX', true)
      },

      ImportDefaultSpecifier: {
        exit (path, { file }) {
          // if (/icon/.test(file.opts.sourceFileName)) {
          //   console.log(path.node)
          // }
          if (path.node.local.name === 'React') {
            file.set('hasReactImport', true)
          }
        }
      },

      Program: {
        enter (path, { file }) {
          file.set('hasJSX', false)
        },

        exit ({ node, scope }, { file }) {
          if (!file.get('hasJSX') || scope.hasBinding('React') || file.get('hasReactImport')) {
            return
          }
          const reactImport = node.body.filter(child => {
            if (child.type === 'ImportDeclaration') {
              const { specifiers } = child
              return specifiers.find(({ type, local }) => type === 'ImportDefaultSpecifier' && local.name === 'React')
            }
          })
          console.log(file.opts.sourceFileName, file.get('hasJSX'), scope.hasBinding('React'), file.get('hasReactImport'), reactImport)
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
