const path = require('path')
module.exports = function transformer(file, api, options) {
  const j = api.jscodeshift
  const root = j(file.source)

  const nextPath = path.resolve('./packages/next')
  const relativePathToNextDir = path
    .relative(file.path, nextPath)
    .replace('../', '') // it's 1dir up
  /*
 {
    //key: { type: 'Identifier', name: 'getInitialProps' }
  }
  */
  root
    .find(j.ImportDeclaration, (node) => {
      return node.source.value.includes('next/dist/compiled')
    })
    .forEach((node) => {
      const val = node.value.source.value
      const relativeCompiled = val.replace('next/dist', relativePathToNextDir)
      node.value.source.value = relativeCompiled
    })

  return root.toSource(options)
}
