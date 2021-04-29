// Factory for creating ESLint rules that identify the JSX Elements representing
// the 'next/image' component, and runs some check on those instances.

function nextImage(callback) {
  return function (context) {
    let imageImports = null
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/image') {
          imageImports = node.specifiers
        }
      },
      JSXOpeningElement(node) {
        const name = node.name.name

        if (!imageImports) {
          return
        }

        if (imageImports.some(({ local }) => local.name === name)) {
          callback(context, node)
        }
      },
    }
  }
}

module.exports = {
  nextImage,
}
