// Factory for creating ESLint rules that identify the JSX Elements representing
// the 'next/image' component, and runs some check on those instances.

module.exports = function (callback) {
  return function (context) {
    let imageComponent = null
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/image') {
          imageComponent = node.specifiers[0].local.name
        }
      },
      JSXOpeningElement(node) {
        if (!imageComponent) {
          return
        }
        if (node.name.name === imageComponent) {
          callback(context, node)
        }
      },
    }
  }
}
