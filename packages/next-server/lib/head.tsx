import React from 'react'
import { AmpStateContext } from './amp-context'
import { HeadManagerContext } from './head-manager-context'
import { isInAmpMode } from './amp'

type WithInAmpMode = {
  inAmpMode?: boolean
}

type State = Array<React.ReactElement<any>> | undefined

const isServer = typeof window === 'undefined'

const headInstanceRefs: Set<any> = new Set()

let headState: State

export function defaultHead(className = 'next-head', inAmpMode = false) {
  const head = [<meta key="charSet" charSet="utf-8" className={className} />]
  if (!inAmpMode) {
    head.push(
      <meta
        key="viewport"
        name="viewport"
        content="width=device-width,minimum-scale=1,initial-scale=1"
        className={className}
      />
    )
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
      React.Children.toArray(child.props.children).reduce(
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
    if (h.key && typeof h.key !== 'number' && h.key.indexOf('.$') === 0) {
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

/**
 *
 * @param headElement List of multiple <Head> instances
 */
function reduceHeadInstances(
  headInstanceRefs: Array<React.RefObject<React.ReactElement>>,
  options: WithInAmpMode
) {
  return headInstanceRefs
    .reduce((list: Array<any>, headInstanceRef) => {
      const headElements = React.Children.toArray(headInstanceRef.current)
      return [...list, ...headElements]
    }, [])
    .reduce(onlyReactElement, [])
    .reverse()
    .concat(defaultHead('', options.inAmpMode))
    .filter(unique())
    .reverse()
    .map((c: React.ReactElement<any>, i: number) => {
      let className: string | undefined =
        (c.props && c.props.className ? c.props.className + ' ' : '') +
        'next-head'

      if (c.type === 'title' && !c.props.className) {
        className = undefined
      }
      const key = c.key || i
      return React.cloneElement(c, { key, className })
    })
}

/**
 * This component injects elements to `<head>` of your page.
 * To avoid duplicated `tags` in `<head>` you can use the `key` property, which will make sure every tag is only rendered once.
 */
function Head({ children }: { children: React.ReactNode }) {
  const ampState = React.useContext(AmpStateContext)
  const updateHead = React.useContext(HeadManagerContext)
  const instanceRef = React.useRef<React.ReactNode>(children)

  // Update the instanceRef every render
  instanceRef.current = children

  const inAmpMode = isInAmpMode(ampState)

  const emitUpdate = React.useCallback(() => {
    headState = reduceHeadInstances([...headInstanceRefs], {
      inAmpMode,
    })
    updateHead(headState)
  }, [updateHead, reduceHeadInstances, inAmpMode])

  // Since this is a Set(), we can just always add it
  headInstanceRefs.add(instanceRef)

  // We want to run this after every single render... right?
  React.useEffect(() => {
    emitUpdate()

    return () => {
      headInstanceRefs.delete(instanceRef)
      emitUpdate()
    }
  })

  return children
}

Head.rewind = () => {
  const recordedState = headState
  headState = undefined
  headInstanceRefs.clear()
  return recordedState
}

export default Head
