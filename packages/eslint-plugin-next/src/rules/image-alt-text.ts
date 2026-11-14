import { defineRule } from '../utils/define-rule'
import { findVariable } from '@eslint-community/eslint-utils'

import type * as ESTree from 'estree'

const url = 'https://nextjs.org/docs/messages/image-alt-text'

const NEXT_IMAGE_SOURCES = new Set(['next/image', 'next/legacy/image'])

export default defineRule({
  meta: {
    docs: {
      description:
        'Enforce `alt` prop on `<Image />` components imported from `next/image`.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
    messages: {
      missingAlt:
        '`<{{name}}>` from `next/image` must have an `alt` prop. Use `alt=""` for decorative images. See: ' +
        url,
      invalidAlt:
        'Invalid `alt` value on `<{{name}}>` from `next/image`. Use `alt=""` for decorative images. See: ' +
        url,
    },
  },
  create(context) {
    const { sourceCode } = context

    // Returns true if `name` resolves to the default export of `next/image`
    // (`import Image from`, `import { default as Image } from`) or, when
    // `namespace` is set, to `import * as name from`.
    function isNextImageBinding(node, name: string, namespace: boolean) {
      const variable = findVariable(sourceCode.getScope(node), name)
      const def = variable?.defs[0]
      if (!def || def.type !== 'ImportBinding') return false
      if (!NEXT_IMAGE_SOURCES.has(def.parent.source.value as string)) {
        return false
      }

      const specifier = def.node
      if (namespace) return specifier.type === 'ImportNamespaceSpecifier'
      return (
        specifier.type === 'ImportDefaultSpecifier' ||
        (specifier.type === 'ImportSpecifier' &&
          getName(specifier.imported) === 'default')
      )
    }

    return {
      JSXOpeningElement(node) {
        const { name } = node
        let isNextImage = false
        if (name.type === 'JSXIdentifier') {
          isNextImage = isNextImageBinding(node, name.name, false)
        } else if (
          name.type === 'JSXMemberExpression' &&
          name.object.type === 'JSXIdentifier' &&
          name.property.name === 'default'
        ) {
          isNextImage = isNextImageBinding(node, name.object.name, true)
        }
        if (!isNextImage) return

        let altAttribute = null
        let hasLabel = false
        for (const attribute of node.attributes) {
          // Spread props may provide `alt`; we can't check them statically.
          if (attribute.type === 'JSXSpreadAttribute') return

          const attributeName = attribute.name.name
          if (attributeName === 'alt') {
            altAttribute = attribute
          } else if (
            (attributeName === 'aria-label' ||
              attributeName === 'aria-labelledby') &&
            !isEmptyString(attribute.value)
          ) {
            hasLabel = true
          }
        }

        const data = { name: sourceCode.getText(name) }

        if (altAttribute) {
          if (isMissingValue(altAttribute.value)) {
            context.report({ node, messageId: 'invalidAlt', data })
          }
          return
        }

        if (!hasLabel) {
          context.report({ node, messageId: 'missingAlt', data })
        }
      },
    }
  },
})

function getName(node: ESTree.Identifier | ESTree.Literal) {
  return node.type === 'Identifier' ? node.name : node.value
}

// `alt`, `alt={undefined}`, `alt={null}`, `alt={false}`
function isMissingValue(value) {
  if (value == null) return true
  if (value.type !== 'JSXExpressionContainer') return false
  const { expression } = value
  return (
    (expression.type === 'Identifier' && expression.name === 'undefined') ||
    (expression.type === 'Literal' &&
      (expression.value === null || expression.value === false))
  )
}

// `aria-label`, `aria-label=""`, `aria-label={undefined}`
function isEmptyString(value) {
  if (isMissingValue(value)) return true
  if (value.type === 'Literal') return value.value === ''
  if (value.type === 'JSXExpressionContainer') {
    return value.expression.type === 'Literal' && value.expression.value === ''
  }
  return false
}
