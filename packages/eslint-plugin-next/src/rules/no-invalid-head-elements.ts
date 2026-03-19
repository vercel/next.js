import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-invalid-head-elements'

function isJSXElement(node: any) {
  return node && node.type === 'JSXElement'
}

function isFragment(node: any) {
  return node && node.type === 'JSXFragment'
}

function getElementName(node: any) {
  if (!node || !node.openingElement || !node.openingElement.name) return null
  const name = node.openingElement.name
  if (name.type === 'JSXIdentifier') return name.name
  return null
}

function collectInvalidChildren(children: any[], invalidNodes: any[]) {
  for (const child of children) {
    if (isFragment(child)) {
      collectInvalidChildren(child.children || [], invalidNodes)
      continue
    }

    if (!isJSXElement(child)) {
      continue
    }

    const name = getElementName(child)

    if (name === 'html' || name === 'body' || name === 'Head') {
      invalidNodes.push(child)
    }
  }
}

export default defineRule({
  meta: {
    docs: {
      description:
        'Prevent usage of invalid elements in `next/head` component.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let isNextHead = false

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/head') {
          return
        }

        if (node.specifiers.some(({ local }) => local.name === 'Head')) {
          isNextHead = true
        }
      },
      JSXElement(node) {
        if (!isNextHead) {
          return
        }

        if (
          !node.openingElement ||
          !node.openingElement.name ||
          node.openingElement.name.type !== 'JSXIdentifier' ||
          node.openingElement.name.name !== 'Head'
        ) {
          return
        }

        const invalidNodes: any[] = []
        collectInvalidChildren(node.children || [], invalidNodes)

        for (const invalidNode of invalidNodes) {
          const name = getElementName(invalidNode)
          if (name === 'Head') {
            context.report({
              node: invalidNode,
              message: `Do not nest \`<Head />\` components inside \`next/head\`. See: ${url}`,
            })
            continue
          }

          context.report({
            node: invalidNode,
            message: `Do not use \`<${name}>\` element with \`next/head\`. Use \`pages/_document\` instead. See: ${url}`,
          })
        }
      },
    }
  },
})
