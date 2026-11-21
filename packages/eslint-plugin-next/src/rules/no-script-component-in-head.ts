import { defineRule } from '../utils/define-rule'
const url = 'https://nextjs.org/docs/messages/no-script-component-in-head'

export default defineRule({
  meta: {
    docs: {
      description: 'Prevent usage of `next/script` in `next/head` component.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    const headImportNames = new Set<string>()
    const scriptImportNames = new Set<string>()

    return {
      'ImportDeclaration[source.value="next/head"] > :matches(ImportDefaultSpecifier, ImportSpecifier[imported.name="default"])'(
        node: any
      ) {
        headImportNames.add(node.local.name)
      },
      'ImportDeclaration[source.value="next/script"] > :matches(ImportDefaultSpecifier, ImportSpecifier[imported.name="default"])'(
        node: any
      ) {
        scriptImportNames.add(node.local.name)
      },
      JSXElement(node) {
        if (
          node.openingElement &&
          node.openingElement.name &&
          !headImportNames.has(node.openingElement.name.name)
        ) {
          return
        }

        const scriptTag = node.children.find(
          (child) =>
            child.openingElement &&
            child.openingElement.name &&
            scriptImportNames.has(child.openingElement.name.name)
        )

        if (scriptTag) {
          context.report({
            node,
            message: `\`next/script\` should not be used in \`next/head\` component. Move \`<Script />\` outside of \`<Head>\` instead. See: ${url}`,
          })
        }
      },
    }
  },
})
