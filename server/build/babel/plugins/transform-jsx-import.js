module.exports = function ({types}) {
  return {
    name: 'transform-jsx-import',
    visitor: {
      ImportDeclaration (path) {
        const value = path.node.source.value
        console.log(value)
        if (value.slice(-4) === '.jsx') {
          path.node.source = types.stringLiteral(value.slice(0, -4))
        }
      }
    }
  }
}
