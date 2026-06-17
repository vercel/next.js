import { defineRule } from '../utils/define-rule'
const url = 'https://nextjs.org/docs/messages/no-css-tags'

export default defineRule({
  meta: {
    docs: {
      description: 'Prevent manual stylesheet tags.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'link') {
          return
        }
        if (node.attributes.length === 0) {
          return
        }

        const attributes = node.attributes.filter(
          (attr) => attr.type === 'JSXAttribute'
        )
        if (
          attributes.find(
            (attr) =>
              attr.name.name === 'rel' && attr.value.value === 'stylesheet'
          ) &&
          attributes.find(
            (attr) =>
              attr.name.name === 'href' &&
              attr.value.type === 'Literal' &&
              !/^https?/.test(attr.value.value)
          )
        ) {
          context.report({
            node,
            message: `Do not include stylesheets manually. See: ${url}`,
          })
        }
      },
    }
  },
})
