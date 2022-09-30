import { defineRule } from '../utils/define-rule'
const url = 'https://nextjs.org/docs/messages/no-duplicate-head'

export = defineRule({
  meta: {
    docs: {
      description:
        'Prevent duplicate usage of `<Head>` in `pages/_document.js`.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let documentImportName
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/document') {
          const documentImport = node.specifiers.find(
            ({ type }) => type === 'ImportDefaultSpecifier'
          )
          if (documentImport && documentImport.local) {
            documentImportName = documentImport.local.name
          }
        }
      },
      ReturnStatement(node) {
        const ancestors = context.getAncestors()
        const documentClass = ancestors.find(
          (ancestorNode) =>
            ancestorNode.type === 'ClassDeclaration' &&
            ancestorNode.superClass &&
            'name' in ancestorNode.superClass &&
            ancestorNode.superClass.name === documentImportName
        )

        if (!documentClass) {
          return
        }

        // @ts-expect-error - `node.argument` could be a `JSXElement` which has property `children`
        if (
          node.argument &&
          'children' in node.argument &&
          node.argument.children
        ) {
          // @ts-expect-error - `node.argument` could be a `JSXElement` which has property `children`
          const headComponents = node.argument.children.filter(
            (childrenNode) =>
              childrenNode.openingElement &&
              childrenNode.openingElement.name &&
              childrenNode.openingElement.name.name === 'Head'
          )

          if (headComponents.length > 1) {
            for (let i = 1; i < headComponents.length; i++) {
              context.report({
                node: headComponents[i],
                message: `Do not include multiple instances of \`<Head/>\`. See: ${url}`,
              })
            }
          }
        }
      },
    }
  },
})
