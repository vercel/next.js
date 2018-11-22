import { declare } from '@babel/helper-plugin-utils'

export default declare((api, options) => {
  api.assertVersion(7)

  return {
    name: 'track-imports',

    visitor: {
      Program: {
        exit (path) {
          path.hub.file.metadata.importSources = gettImportSources(path)
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
