import React from 'react'
import withSideEffect from './side-effect'
import { AmpStateContext } from './amp-context'
import { HeadManagerContext } from './head-manager-context'
import { isInAmpMode } from './amp'

export function defaultHead(inAmpMode = false) {
  return [<meta key="charSet" charSet="utf-8" />].concat(
    inAmpMode ? (
      []
    ) : (
      <meta
        key="viewport"
        name="viewport"
        content="width=device-width,minimum-scale=1,initial-scale=1"
      />
    )
  )
}

function onlyReactElement(
  list: Array<React.ReactElement<any>>,
  child: React.ReactChild
): Array<React.ReactElement<any>> {
  // React children can be "string" or "number" in this case we ignore them for backwards compat
  if (typeof child === 'string' || typeof child === 'number') {
    return list
  }
  return child.type === React.Fragment
    ? list.concat(
        React.Children.toArray(child.props.children).reduce(
          onlyReactElement,
          []
        )
      )
    : list.concat(child)
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
  const metaCategories: Record<string, Set<string>> = {}

  const isExistingAdd = <T extends any>(set: Set<T>, ele: T) => {
    return set.has(ele) ? false : Boolean(set.add(ele))
  }

  return (h: React.ReactElement<any>) => {
    if (h.key && typeof h.key !== 'number' && h.key.indexOf('.$') === 0) {
      return isExistingAdd(keys, h.key)
    }
    switch (h.type) {
      case 'title':
      case 'base':
        return isExistingAdd(tags, h.type)
      case 'meta':
        return METATYPES.reduce((isUnique, metatype) => {
          if (!isUnique || !h.props.hasOwnProperty(metatype)) return isUnique
          if (metatype === 'charSet') return isExistingAdd(metaTypes, metatype)

          const category = h.props[metatype]
          const categories = metaCategories[metatype] || new Set()
          if (categories.has(category)) return false
          categories.add(category)
          metaCategories[metatype] = categories
          return isUnique
        }, true)
    }
    return true
  }
}

/**
 *
 * @param headElements List of multiple <Head> instances
 * @param props {inAmpMode: boolean} used to run this function inAmpMode
 */
function reduceComponents(
  headElements: Array<React.ReactElement<any>>,
  props: { inAmpMode?: boolean }
) {
  return headElements
    .reduce(
      (list: React.ReactChild[], headElement: React.ReactElement<any>) => {
        const headElementChildren = React.Children.toArray(
          headElement.props.children
        )
        return list.concat(headElementChildren)
      },
      []
    )
    .reduce(onlyReactElement, [])
    .reverse()
    .concat(defaultHead(props.inAmpMode))
    .filter(unique())
    .reverse()
    .map((ele, i) => React.cloneElement(ele, { key: ele.key || i }))
}

const Effect = withSideEffect()

/**
 * This component injects elements to `<head>` of your page.
 * To avoid duplicated `tags` in `<head>` you can use the `key` property, which will make sure every tag is only rendered once.
 */
function Head({ children }: { children: React.ReactNode }) {
  return (
    <AmpStateContext.Consumer>
      {ampState => (
        <HeadManagerContext.Consumer>
          {updateHead => (
            <Effect
              reduceComponentsToState={reduceComponents}
              handleStateChange={updateHead}
              inAmpMode={isInAmpMode(ampState)}
            >
              {children}
            </Effect>
          )}
        </HeadManagerContext.Consumer>
      )}
    </AmpStateContext.Consumer>
  )
}

Head.rewind = Effect.rewind

export default Head
