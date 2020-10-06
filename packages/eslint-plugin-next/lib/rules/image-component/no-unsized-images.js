module.exports = {
  meta: {
    messages: {
      unsizedImages:
        'For layout stability, the image component should be used ' +
        'with a height and width property, even if actual image size is determined with CSS.' +
        'if you cannot provide a correct-ratio height and width, use the "unsized" attribute.' +
        'More info: https://web.dev/optimize-cls/#images-without-dimensions',
    },
  },
  create(context) {
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
          //Image Component rules here
          if (!imageValidSize(node)) {
            context.report({
              node,
              messageId: 'unsizedImages',
            })
          }
        }
      },
    }
  },
}

function imageValidSize(node) {
  let attributes = node.attributes.map((attribute) => attribute.name.name)
  return (
    attributes.includes('unsized') ||
    (attributes.includes('height') && attributes.includes('width'))
  )
}
