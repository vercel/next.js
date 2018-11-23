import { declare } from '@babel/helper-plugin-utils'

export default declare((api, options) => {
  api.assertVersion(7)

  return {
    name: 'track-imports',

    visitor: {
      Program: {
        enter (path, { file }) {
          file.metadata.importSources = []
        },
        exit (path, { file }) {
          file.metadata.importSources.push(...gettImportSources(path))
        }
      },
      CallExpression: {
        enter (path, { file }) {
          const { callee } = path.node
          const arg = path.node.arguments[0]
          if (arg && arg.type === 'StringLiteral') {
            if (callee.name === 'require') {
              file.metadata.importSources.push(arg.value)
            }
          }
        }
      }
    }
  }
})

function gettImportSources (programPath) {
  return programPath.get('body').filter(child => {
    return child.isExportAllDeclaration() ||
      child.isExportNamedDeclaration() ||
      child.isImportDeclaration()
  })
    .filter(child => child.node.source)
    .map(child => child.get('source').get('value').node)
}
