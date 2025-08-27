// It might insert extra parens for JSX components
// x-ref: https://github.com/facebook/jscodeshift/issues/534

import type { API, Collection, FileInfo, JSXElement } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'
import { NEXT_CODEMOD_ERROR_PREFIX } from './lib/async-request-api/utils'

export default function transformer(file: FileInfo, _api: API) {
  const j = createParserFromPath(file.path)

  const $j = j(file.source)
  let hasChanges = false

  $j.find(j.ImportDeclaration, { source: { value: 'next/link' } }).forEach(
    (path) => {
      const defaultImport = j(path).find(j.ImportDefaultSpecifier)
      if (defaultImport.size() === 0) {
        return
      }

      const variableName = j(path)
        .find(j.ImportDefaultSpecifier)
        .find(j.Identifier)
        .get('name').value
      if (!variableName) {
        return
      }

      const linkElements = $j.findJSXElements(variableName)

      linkElements.forEach((linkPath) => {
        const $link: Collection<JSXElement> = j(linkPath)

        if ($link.size() === 0) {
          return
        }

        const $legacyBehaviorProps = $link.find(j.JSXAttribute, {
          name: { type: 'JSXIdentifier', name: 'legacyBehavior' },
        })
        $legacyBehaviorProps.remove()
        hasChanges ||= $legacyBehaviorProps.size() > 0

        const $passHrefProps = $link.find(j.JSXAttribute, {
          name: { type: 'JSXIdentifier', name: 'passHref' },
        })
        $passHrefProps.remove()
        hasChanges ||= $passHrefProps.size() > 0

        const linkChildrenNodes = $link.get('children')

        // Text-only link children are already correct with the new behavior
        // `next/link` would previously auto-wrap typeof 'string' children already
        if (
          linkChildrenNodes.value &&
          linkChildrenNodes.value.length === 1 &&
          linkChildrenNodes.value[0].type === 'JSXText'
        ) {
          return
        }

        // Direct child elements referenced
        const $childrenElements = $link.childElements()
        const $childrenWithA = $childrenElements.filter((childPath) => {
          return (
            j(childPath).find(j.JSXOpeningElement).get('name').get('name')
              .value === 'a'
          )
        })

        if ($childrenWithA.length === 0) {
          if ($legacyBehaviorProps.length > 0) {
            linkPath.node.children.unshift(
              j.jsxText('\n'),
              j.jsxExpressionContainer.from({
                expression: j.jsxEmptyExpression.from({
                  comments: [
                    j.commentBlock.from({
                      value: ` ${NEXT_CODEMOD_ERROR_PREFIX} This Link previously used the now removed \`legacyBehavior\` prop, and has a child that might not be an anchor. The codemod bailed out of lifting the child props to the Link. Check that the child component does not render an anchor, and potentially move the props manually to Link. `,
                    }),
                  ],
                }),
              })
            )
            hasChanges = true
          }
        } else {
          const props = $childrenWithA.get('attributes').value
          const hasProps = props.length > 0

          if (hasProps) {
            // Add only unique props to <Link> (skip duplicate props)
            const linkPropNames = $link
              .get('attributes')
              .value.map((linkProp) => linkProp?.name?.name)
            const uniqueProps = []

            props.forEach((anchorProp) => {
              if (!linkPropNames.includes(anchorProp?.name?.name)) {
                uniqueProps.push(anchorProp)
              }
            })

            $link.get('attributes').value.push(...uniqueProps)

            // Remove props from <a>
            props.length = 0
            hasChanges = true
          }

          const childrenProps = $childrenWithA.get('children')
          $childrenWithA.replaceWith(childrenProps.value)
          hasChanges = true
        }
      })
    }
  )

  if (hasChanges) {
    return $j.toSource()
  }
  return file.source
}
