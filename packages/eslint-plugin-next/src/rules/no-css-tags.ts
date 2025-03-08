import { defineRule } from '../utils/define-rule.js'
const url = 'https://nextjs.org/docs/messages/no-css-tags'

export const noCssTags = defineRule({
  meta: {
    docs: {
      description: 'Prevent manual stylesheet tags.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context: any) {
    return {
      JSXOpeningElement(node: any) {
        if (node.name.name !== 'link') {
          return
        }
        if (node.attributes.length === 0) {
          return
        }

        const attributes = node.attributes.filter(
          (attr: any) => attr.type === 'JSXAttribute'
        )
        if (
          attributes.find(
            (attr: any) =>
              attr.name.name === 'rel' && attr.value.value === 'stylesheet'
          ) &&
          attributes.find(
            (attr: any) =>
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
