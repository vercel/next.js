module.exports = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Ensure stylesheets are preloaded',
      category: 'Optimizations',
      recommended: true,
    },
  },
  create: function (context) {
    const preloads = new Set()
    const links = new Map()

    return {
      'Program:exit': function (node) {
        for (let [href, linkNode] of links.entries()) {
          if (!preloads.has(href)) {
            context.report({
              node: linkNode,
              message:
                'Stylesheet does not have an associated preload tag. This could potentially impact First paint.',
              fix: function (fixer) {
                return fixer.insertTextBefore(
                  linkNode,
                  `<link rel="preload" href="${href}" as="style" />`
                )
              },
            })
          }
        }

        links.clear()
        preloads.clear()
      },
      'JSXOpeningElement[name.name=link][attributes.length>0]': function (
        node
      ) {
        const attributes = node.attributes.filter(
          (attr) => attr.type === 'JSXAttribute'
        )
        const rel = attributes.find((attr) => attr.name.name === 'rel')
        const relValue = rel && rel.value.value
        const href = attributes.find((attr) => attr.name.name === 'href')
        const hrefValue = href && href.value.value
        const media = attributes.find((attr) => attr.name.name === 'media')
        const mediaValue = media && media.value.value

        if (relValue === 'preload') {
          preloads.add(hrefValue)
        } else if (relValue === 'stylesheet' && mediaValue !== 'print') {
          links.set(hrefValue, node)
        }
      },
    }
  },
}
