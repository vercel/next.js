'use client'

import React, { useContext, type JSX } from 'react'
import Effect from './side-effect'
import { HeadManagerContext } from './head-manager-context.shared-runtime'
import { warnOnce } from './utils/warn-once'

export function defaultHead(): JSX.Element[] {
  const head = [
    <meta charSet="utf-8" key="charset" />,
    <meta name="viewport" content="width=device-width" key="viewport" />,
  ]
  return head
}

function onlyReactElement(
  list: Array<React.ReactElement<any>>,
  child: React.ReactElement | number | string
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
          fragmentChild: React.ReactElement | number | string
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

// Valid HTML tags that can appear in <head>
const VALID_HEAD_TAGS = new Set([
  'title',
  'base',
  'link',
  'meta',
  'style',
  'script',
  'noscript',
])

// Common invalid tags that users mistakenly put in <head>
const INVALID_HEAD_TAGS = new Set([
  'html',
  'body',
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'nav',
  'aside',
  'ul',
  'ol',
  'li',
  'table',
  'tr',
  'td',
  'th',
  'form',
  'input',
  'button',
  'img',
  'a',
])

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
function reduceComponents(
  headChildrenElements: Array<React.ReactElement<any>>
) {
  return headChildrenElements
    .reduce(onlyReactElement, [])
    .reverse()
    .concat(defaultHead().reverse())
    .filter(unique())
    .reverse()
    .map((c: React.ReactElement<any>, i: number) => {
      const key = c.key || i
      if (process.env.NODE_ENV === 'development') {
        // Check for invalid tags in <head>
        const tagName = typeof c.type === 'string' ? c.type.toLowerCase() : null
        if (tagName && INVALID_HEAD_TAGS.has(tagName)) {
          warnOnce(
            `Invalid tag <${tagName}> found in <Head>. Only the following tags are allowed in <Head>: ${Array.from(VALID_HEAD_TAGS).join(', ')}. This tag will be ignored. See more info here: https://nextjs.org/docs/api-reference/next/head`
          )
        }

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
  const headManager = useContext(HeadManagerContext)
  return (
    <Effect
      reduceComponentsToState={reduceComponents}
      headManager={headManager}
    >
      {children}
    </Effect>
  )
}

export default Head
