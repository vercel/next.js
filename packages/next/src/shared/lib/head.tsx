'use client'

import React, { useContext } from 'react'
import Effect from './side-effect'
import { AmpStateContext } from './amp-context.shared-runtime'
import { HeadManagerContext } from './head-manager-context.shared-runtime'
import { isInAmpMode } from './amp-mode'
import { warnOnce } from './utils/warn-once'

type WithInAmpMode = {
  inAmpMode?: boolean
}

export function defaultHead(inAmpMode = false): JSX.Element[] {
  const head = [<meta charSet="utf-8" />]
  if (!inAmpMode) {
    head.push(<meta name="viewport" content="width=device-width" />)
  }
  return head
}

function onlyReactElement(
  list: Array<React.ReactElement<any>>,
  child: React.ReactChild
): Array<React.ReactElement<any>> {
  // React children can be "string" or "number" in this case we ignore them for backwards compat
  if (typeof child === 'string' || typeof child === 'number') {
    return list
  }
  // Adds support for React.Fragment
  if (child.type === React.Fragment) {
    return list.concat(
      // @ts-expect-error @types/react does not remove fragments but this could also return ReactPortal[]
      React.Children.toArray(child.props.children).reduce(
        // @ts-expect-error @types/react does not remove fragments but this could also return ReactPortal[]
        (
          fragmentList: Array<React.ReactElement<any>>,
          fragmentChild: React.ReactChild
        ): Array<React.ReactElement<any>> => {
          if (
            typeof fragmentChild === 'string' ||
            typeof fragmentChild === 'number'
          ) {
            return fragmentList
          }
          return fragmentList.concat(fragmentChild)
        },
        []
      )
    )
  }
  return list.concat(child)
}

const METATYPES = ['name', 'httpEquiv', 'charSet', 'itemProp']

/*
 returns a function for filtering head child elements
 which shouldn't be duplicated, like <title/>
 Also adds support for deduplicated `key` properties
*/
function unique() {
  const keys = new Set()
  const tags = new Set()
  const metaTypes = new Set()
  const metaCategories: { [metatype: string]: Set<string> } = {}

  return (h: React.ReactElement<any>) => {
    let isUnique = true
    let hasKey = false

    if (h.key && typeof h.key !== 'number' && h.key.indexOf('$') > 0) {
      hasKey = true
      const key = h.key.slice(h.key.indexOf('$') + 1)
      if (keys.has(key)) {
        isUnique = false
      } else {
        keys.add(key)
      }
    }

    // eslint-disable-next-line default-case
    switch (h.type) {
      case 'title':
      case 'base':
        if (tags.has(h.type)) {
          isUnique = false
        } else {
          tags.add(h.type)
        }
        break
      case 'meta':
        for (let i = 0, len = METATYPES.length; i < len; i++) {
          const metatype = METATYPES[i]
          if (!h.props.hasOwnProperty(metatype)) continue

          if (metatype === 'charSet') {
            if (metaTypes.has(metatype)) {
              isUnique = false
            } else {
              metaTypes.add(metatype)
            }
          } else {
            const category = h.props[metatype]
            const categories = metaCategories[metatype] || new Set()
            if ((metatype !== 'name' || !hasKey) && categories.has(category)) {
              isUnique = false
            } else {
              categories.add(category)
              metaCategories[metatype] = categories
            }
          }
        }
        break
    }

    return isUnique
  }
}

/**
 *
 * @param headChildrenElements List of children of <Head>
 */
function reduceComponents<T extends {} & WithInAmpMode>(
  headChildrenElements: Array<React.ReactElement<any>>,
  props: T
) {
  const { inAmpMode } = props
  return headChildrenElements
    .reduce(onlyReactElement, [])
    .reverse()
    .concat(defaultHead(inAmpMode).reverse())
    .filter(unique())
    .reverse()
    .map((c: React.ReactElement<any>, i: number) => {
      const key = c.key || i
      if (
        process.env.NODE_ENV !== 'development' &&
        process.env.__NEXT_OPTIMIZE_FONTS &&
        !inAmpMode
      ) {
        if (
          c.type === 'link' &&
          c.props['href'] &&
          // TODO(prateekbh@): Replace this with const from `constants` when the tree shaking works.
          ['https://fonts.googleapis.com/css', 'https://use.typekit.net/'].some(
            (url) => c.props['href'].startsWith(url)
          )
        ) {
          const newProps = { ...(c.props || {}) }
          newProps['data-href'] = newProps['href']
          newProps['href'] = undefined

          // Add this attribute to make it easy to identify optimized tags
          newProps['data-optimized-fonts'] = true

          return React.cloneElement(c, newProps)
        }
      }
      if (process.env.NODE_ENV === 'development') {
        // omit JSON-LD structured data snippets from the warning
        if (c.type === 'script' && c.props['type'] !== 'application/ld+json') {
          const srcMessage = c.props['src']
            ? `<script> tag with src="${c.props['src']}"`
            : `inline <script>`
          warnOnce(
            `Do not add <script> tags using next/head (see ${srcMessage}). Use next/script instead. \nSee more info here: https://nextjs.org/docs/messages/no-script-tags-in-head-component`
          )
        } else if (c.type === 'link' && c.props['rel'] === 'stylesheet') {
          warnOnce(
            `Do not add stylesheets using next/head (see <link rel="stylesheet"> tag with href="${c.props['href']}"). Use Document instead. \nSee more info here: https://nextjs.org/docs/messages/no-stylesheets-in-head-component`
          )
        }
      }
      return React.cloneElement(c, { key })
    })
}

/**
 * This component injects elements to `<head>` of your page.
 * To avoid duplicated `tags` in `<head>` you can use the `key` property, which will make sure every tag is only rendered once.
 */
function Head({ children }: { children: React.ReactNode }) {
  const ampState = useContext(AmpStateContext)
  const headManager = useContext(HeadManagerContext)
  return (
    <Effect
      reduceComponentsToState={reduceComponents}
      headManager={headManager}
      inAmpMode={isInAmpMode(ampState)}
    >
      {children}
    </Effect>
  )
}

export default Head
