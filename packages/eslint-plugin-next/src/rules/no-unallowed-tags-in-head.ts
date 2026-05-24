import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-unallowed-tags-in-head'

// Tags that are valid inside <head> per HTML spec
const VALID_HEAD_TAGS = new Set([
  'title',
  'meta',
  'link',
  'style',
  'script',
  'base',
  'noscript',
  'template',
])

export default defineRule({
  meta: {
    docs: {
      description:
        'Prevent invalid HTML tags from being used in `next/head` component.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
    messages: {
      invalidTag:
        'Do not use `<{{tag}}>` inside `<Head>` from `next/head`. Only tags valid in `<head>` are allowed: `title`, `meta`, `link`, `style`, `script`, `base`, `noscript`, and `template`. See: {{url}}',
    },
  },
  create(context) {
    let isNextHeadImported = false

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/head') {
          isNextHeadImported = true
        }
      },
      JSXElement(node) {
        if (!isNextHeadImported) return

        // Check if this is a <Head> component
        const tagName = node.openingElement?.name
        if (
          !tagName ||
          (tagName.type === 'JSXIdentifier' && tagName.name !== 'Head')
        ) {
          return
        }

        const checkChildren = (children: any[], depth: number) => {
          for (const child of children) {
            // Handle JSXFragment shorthand (<>...</>)
            if (child.type === 'JSXFragment') {
              if (depth < 1) {
                checkChildren(child.children || [], depth + 1)
              }
              continue
            }

            if (child.type === 'JSXElement') {
              const childTagName = child.openingElement?.name

              if (!childTagName) continue

              // Handle named Fragment (<Fragment>, <React.Fragment>)
              if (
                childTagName.type === 'JSXIdentifier' &&
                (childTagName.name === 'Fragment' ||
                  childTagName.name === 'ReactFragment')
              ) {
                if (depth < 1) {
                  checkChildren(child.children || [], depth + 1)
                }
                continue
              }

              // Skip custom React components (PascalCase)
              if (
                childTagName.type === 'JSXIdentifier' &&
                childTagName.name[0] === childTagName.name[0].toUpperCase() &&
                childTagName.name[0] !== childTagName.name[0].toLowerCase()
              ) {
                continue
              }

              // Check if it's a lowercase HTML tag that's not in the valid set
              if (
                childTagName.type === 'JSXIdentifier' &&
                !VALID_HEAD_TAGS.has(childTagName.name)
              ) {
                context.report({
                  node: child,
                  messageId: 'invalidTag',
                  data: { tag: childTagName.name, url },
                })
              }
            }
          }
        }

        checkChildren(node.children || [], 0)
      },
    }
  },
})
