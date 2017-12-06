// This plugins removes the `.jsx` extension from import statements. Because we transpile .jsx files to .js in .next
// E.g. `import Hello from '../components/hello.jsx'` will become `import Hello from  '../components/hello'`
module.exports = function ({types}) {
  return {
    name: 'remove-dotjsx-from-import',
    visitor: {
      ImportDeclaration (path) {
        const value = path.node.source.value
        if (value.slice(-4) === '.jsx') {
          path.node.source = types.stringLiteral(value.slice(0, -4))
        }
      }
    }
  }
}
