import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-invalid-head-children'

// HTML elements that are valid children of <head> (and therefore of next/head).
const allowedHeadChildren = new Set([
  'title',
  'meta',
  'link',
  'style',
  'script',
  'base',
  'noscript',
])

export default defineRule({
  meta: {
    docs: {
      description:
        'Prevent invalid HTML elements from being used in `next/head` component.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let nextHeadImportName: string | null = null

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/head') {
          return
        }
        const defaultImport = node.specifiers.find(
          (specifier) => specifier.type === 'ImportDefaultSpecifier'
        )
        if (defaultImport) {
          nextHeadImportName = defaultImport.local.name
        }
      },
      JSXElement(node) {
        if (!nextHeadImportName) {
          return
        }
        if (
          node.openingElement?.name?.type !== 'JSXIdentifier' ||
          node.openingElement.name.name !== nextHeadImportName
        ) {
          return
        }

        for (const child of node.children) {
          if (
            child.type !== 'JSXElement' ||
            child.openingElement?.name?.type !== 'JSXIdentifier'
          ) {
            continue
          }
          const tagName = child.openingElement.name.name
          // Only intrinsic (lowercase) HTML elements can be invalid here.
          // Custom components (capitalized) may render valid head elements.
          if (
            tagName[0] === tagName[0].toLowerCase() &&
            !allowedHeadChildren.has(tagName)
          ) {
            context.report({
              node: child,
              message: `Do not use <${tagName}> in \`next/head\` component. Only ${[
                ...allowedHeadChildren,
              ]
                .map((tag) => `<${tag}>`)
                .join(', ')} are allowed. See: ${url}`,
            })
          }
        }
      },
    }
  },
})
