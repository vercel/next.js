const url = 'https://nextjs.org/docs/messages/no-img-element'
const message = `Do not use \`<img>\` element. Use \`<Image />\` from \`next/image\` instead. See: ${url}`

module.exports = {
  meta: {
    docs: {
      description: 'Prevent usage of `<img>` element to prevent layout shift.',
      category: 'HTML',
      recommended: true,
      url,
    },
    fixable: 'code',
  },

  create: function (context) {
    let styledSpecifierName

    const checkMemberExpression = (exp, recursive) => {
      // one-depth recursive check for styled.img.attrs()
      if (recursive && exp.object.type === 'MemberExpression') {
        checkMemberExpression(exp.object, false)
        return
      }

      if (
        exp.object.type === 'Identifier' &&
        exp.object.name === styledSpecifierName &&
        exp.property.type === 'Identifier' &&
        exp.property.name === 'img'
      ) {
        context.report({ node: exp, message })
      }
    }

    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'img') {
          return
        }

        if (node.attributes.length === 0) {
          return
        }

        if (node.parent?.parent?.openingElement?.name?.name === 'picture') {
          return
        }

        context.report({ node, message })
      },
      ImportDeclaration(node) {
        if (styledSpecifierName || node.source.value !== 'styled-components') {
          return
        }

        const defaultSpecifier = node.specifiers.find(
          (s) => s.type === 'ImportDefaultSpecifier'
        )

        if (!defaultSpecifier) return

        styledSpecifierName = defaultSpecifier.local.name
      },
      CallExpression(node) {
        if (!styledSpecifierName) return
        if (node.callee.type !== 'MemberExpression') return

        checkMemberExpression(node.callee, true)
      },
      TaggedTemplateExpression(node) {
        if (!styledSpecifierName) return
        if (node.tag.type !== 'MemberExpression') return

        checkMemberExpression(node.tag, true)
      },
    }
  },
}
