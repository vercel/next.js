import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-invalid-head-children'

// Valid HTML elements that can be children of <head>
// Reference: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/head
const VALID_HEAD_CHILDREN = new Set([
  'title',
  'meta',
  'link',
  'script',
  'style',
  'base',
  'noscript',
])

export default defineRule({
  meta: {
    docs: {
      description: 'Prevent usage of invalid HTML elements inside `next/head`.',
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
        if (node.source.value === 'next/head') {
          // Find the import name (could be renamed: import MyHead from 'next/head')
          const defaultImport = node.specifiers.find(
            (specifier) => specifier.type === 'ImportDefaultSpecifier'
          )
          if (defaultImport && defaultImport.local) {
            nextHeadImportName = defaultImport.local.name
          }
        }
      },
      JSXElement(node) {
        // Skip if next/head is not imported
        if (!nextHeadImportName) {
          return
        }

        // Check if this is a <Head> element from next/head
        if (
          !node.openingElement ||
          !node.openingElement.name ||
          !('name' in node.openingElement.name) ||
          node.openingElement.name.name !== nextHeadImportName
        ) {
          return
        }

        // Check each child element
        for (const child of node.children) {
          // Only check JSX elements (skip text, expressions, etc.)
          if (child.type !== 'JSXElement') {
            continue
          }

          const childOpening = child.openingElement
          if (!childOpening || !childOpening.name) {
            continue
          }

          // Get the element name
          let elementName: string | null = null
          if ('name' in childOpening.name) {
            // Regular JSX element like <div>
            elementName = childOpening.name.name as string
          } else if (
            childOpening.name.type === 'JSXMemberExpression' ||
            childOpening.name.type === 'JSXNamespacedName'
          ) {
            // Skip member expressions like <Component.Child> or namespaced <svg:rect>
            // These are likely React components which are handled differently
            continue
          }

          if (!elementName) {
            continue
          }

          // Check if it's a React component (PascalCase) - skip those
          // Components are allowed and may render valid head elements
          if (elementName[0] === elementName[0].toUpperCase()) {
            continue
          }

          // Check if the lowercase element name is valid
          const lowerElementName = elementName.toLowerCase()
          if (!VALID_HEAD_CHILDREN.has(lowerElementName)) {
            context.report({
              node: child,
              message: `\`<${elementName}>\` is not a valid child of \`next/head\`. Only \`<title>\`, \`<meta>\`, \`<link>\`, \`<script>\`, \`<style>\`, \`<base>\`, and \`<noscript>\` are allowed. Using invalid elements can cause the "next-head-count is missing" error. See: ${url}`,
            })
          }
        }
      },
    }
  },
})
