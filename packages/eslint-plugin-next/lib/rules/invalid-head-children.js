module.exports = {
  meta: {
    docs: {
      description: 'Disallow html tags other than title, meta and scripts in next/head component',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-script-component-in-head-component',
    }
  },
  create: function (context) {
    let isNextHead = null

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/head') {
          isNextHead = true
        }
      },
      JSXElement(node) {
        if (!isNextHead) {
          return
        }

        if (
          node.openingElement &&
          node.openingElement.name &&
          node.openingElement.name.name !== 'Head'
        ) {
          return
        }
        const allowedHeadChildren = new Set(['title', 'meta', 'script'])
        const invalidChildren = node.children.filter(
          (child) =>
            child.openingElement &&
            child.openingElement.name &&
            !allowedHeadChildren.has(child.openingElement.name.name)
        )
        invalidChildren.forEach(element => {
          context.report({
            node: element,
            message: `HTML element of type <${element.openingElement.name.name}> should not be included in next/head component`
          })
        })
      },
    }
  },
}
