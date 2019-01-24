import React from 'react'
import withSideEffect from './side-effect'
import { HeadManagerContext } from './head-manager-context'

const NEXT_HEAD_IDENTIFIER = 'next-head'

export function defaultHead (className = NEXT_HEAD_IDENTIFIER) {
  return [
    <meta key='charSet' charSet='utf-8' className={className} />
  ]
}

function reduceComponents (components) {
  return components
    .map((component) => React.Children.toArray(component.props.children))
    .reduce((a, b) => a.concat(b), [])
    .reduce((a, b) => {
      if (React.Fragment && b.type === React.Fragment) {
        return a.concat(React.Children.toArray(b.props.children))
      }
      return a.concat(b)
    }, [])
    .reverse()
    .concat(defaultHead(''))
    .filter(Boolean)
    .filter(unique())
    .reverse()
    .map((c, i) => {
      const className = (c.props && c.props.className ? c.props.className + ' ' : '') + NEXT_HEAD_IDENTIFIER
      const key = c.key || i
      return React.cloneElement(c, { key, className })
    })
}

const METATYPES = ['name', 'httpEquiv', 'charSet', 'itemProp']

/*
 returns a function for filtering head child elements
 which shouldn't be duplicated, like <title/>
 Also adds support for deduplicated `key` properties
*/

function unique () {
  const keys = new Set()
  const tags = new Set()
  const metaTypes = new Set()
  const metaCategories = {}

  return (h) => {
    if (h.key && h.key.indexOf('.$') === 0) {
      if (keys.has(h.key)) return false
      keys.add(h.key)
      return true
    }
    switch (h.type) {
      case 'title':
      case 'base':
        if (tags.has(h.type)) return false
        tags.add(h.type)
        break
      case 'meta':
        for (let i = 0, len = METATYPES.length; i < len; i++) {
          const metatype = METATYPES[i]
          if (!h.props.hasOwnProperty(metatype)) continue

          if (metatype === 'charSet') {
            if (metaTypes.has(metatype)) return false
            metaTypes.add(metatype)
          } else {
            const category = h.props[metatype]
            const categories = metaCategories[metatype] || new Set()
            if (categories.has(category)) return false
            categories.add(category)
            metaCategories[metatype] = categories
          }
        }
        break
    }
    return true
  }
}

const Effect = withSideEffect()

function Head ({children}) {
  return <HeadManagerContext.Consumer>
    {(updateHead) => <Effect reduceComponentsToState={reduceComponents} handleStateChange={updateHead}>{children}</Effect>}
  </HeadManagerContext.Consumer>
}

Head.rewind = Effect.rewind

export default Head
