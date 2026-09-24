import { defineRule } from '../utils/define-rule'

const VALID_HEAD_TAGS = new Set([
  'title',
  'base',
  'link',
  'meta',
  'script',
  'style',
  'noscript',
  'template',
])

const url = 'https://nextjs.org/docs/messages/no-invalid-html-tags-in-head'

export default defineRule({
  meta: {
    docs: {
      description:
        'Prevent use of invalid HTML elements inside the `next/head` component.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let headImportName: string | null = null

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/head') {
          return
        }
        const defaultImport = node.specifiers.find(
          (s) => s.type === 'ImportDefaultSpecifier'
        )
        if (defaultImport) {
          headImportName = defaultImport.local.name
        }
      },
      JSXElement(node) {
        if (!headImportName) {
          return
        }

        const { openingElement } = node
        if (
          openingElement.name.type !== 'JSXIdentifier' ||
          openingElement.name.name !== headImportName
        ) {
          return
        }

        for (const child of node.children) {
          if (
            child.type !== 'JSXElement' ||
            child.openingElement.name.type !== 'JSXIdentifier'
          ) {
            continue
          }

          const tagName = child.openingElement.name.name
          // Only lint lowercase names (native HTML elements); skip React components.
          if (tagName !== tagName.toLowerCase()) {
            continue
          }
          if (!VALID_HEAD_TAGS.has(tagName)) {
            context.report({
              node: child,
              message: `\`<${tagName}>\` is not a valid element inside \`<Head>\` from \`next/head\`. Only elements valid inside \`<head>\` are allowed (title, base, link, meta, script, style, noscript, template). See: ${url}`,
            })
          }
        }
      },
    }
  },
})
