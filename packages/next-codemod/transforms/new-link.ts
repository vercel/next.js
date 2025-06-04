// It might insert extra parnes for JSX components
// x-ref: https://github.com/facebook/jscodeshift/issues/534

import type { API, FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

export default function transformer(file: FileInfo, _api: API) {
  const j = createParserFromPath(file.path)

  const $j = j(file.source)

  return $j
    .find(j.ImportDeclaration, { source: { value: 'next/link' } })
    .forEach((path) => {
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
      const hasStylesJSX = $j.findJSXElements('style').some((stylePath) => {
        const $style = j(stylePath)
        const hasJSXProp =
          $style.find(j.JSXAttribute, { name: { name: 'jsx' } }).size() !== 0

        return hasJSXProp
      })

      linkElements.forEach((linkPath) => {
        const $link = j(linkPath).filter((childPath) => {
          // Exclude links with `legacybehavior` prop from modification
          return (
            j(childPath)
              .find(j.JSXAttribute, { name: { name: 'legacyBehavior' } })
              .size() === 0
          )
        })

        if ($link.size() === 0) {
          return
        }

        // If file has <style jsx> enable legacyBehavior
        // and keep <a> to stay on the safe side
        if (hasStylesJSX) {
          $link
            .get('attributes')
            .push(j.jsxAttribute(j.jsxIdentifier('legacyBehavior')))
          return
        }

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

        // No <a> as child to <Link> so the old behavior is used
        if ($childrenWithA.size() !== 1) {
          $link
            .get('attributes')
            .push(j.jsxAttribute(j.jsxIdentifier('legacyBehavior')))
          return
        }

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
        }

        const childrenProps = $childrenWithA.get('children')
        $childrenWithA.replaceWith(childrenProps.value)
      })
    })
    .toSource()
}
