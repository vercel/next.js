module.exports = {
  meta: {
    messages: {
      missingAltText:
        'All images should have an alt property for descriptive text. ' +
        'Purely decorative images can use an empty alt attribute.' +
        'See: https://web.dev/image-alt/',
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
          if (!imageHasAltText(node)) {
            context.report({
              node,
              messageId: 'missingAltText',
            })
          }
        }
      },
    }
  },
}

function imageHasAltText(node) {
  let attributes = node.attributes.map((attribute) => attribute.name.name)
  return attributes.includes('alt')
}
