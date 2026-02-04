/// <reference types="webpack/module.d.ts" />

const isOldIE = (function isOldIE() {
  let memo: any

  return function memorize() {
    if (typeof memo === 'undefined') {
      // Test for IE <= 9 as proposed by Browserhacks
      // @see http://browserhacks.com/#hack-e71d8692f65334173fee715c222cb805
      // Tests for existence of standard globals is to allow style-loader
      // to operate correctly into non-standard environments
      // @see https://github.com/webpack-contrib/style-loader/issues/177
      memo = Boolean(window && document && document.all && !window.atob)
    }

    return memo
  }
})()

const getTargetElement = (function () {
  const memo: any = {}

  return function memorize(target: any) {
    if (typeof memo[target] === 'undefined') {
      let styleTarget: any = document.querySelector(target)

      // Special case to return head of iframe instead of iframe itself
      if (
        window.HTMLIFrameElement &&
        styleTarget instanceof window.HTMLIFrameElement
      ) {
        try {
          // This will throw an exception if access to iframe is blocked
          // due to cross-origin restrictions
          styleTarget = (styleTarget as any).contentDocument.head
        } catch (e) {
          // istanbul ignore next
          styleTarget = null
        }
      }

      memo[target] = styleTarget
    }

    return memo[target]
  }
})()

const stylesInDom: any = []

function getIndexByIdentifier(identifier: any) {
  let result = -1

  for (let i = 0; i < stylesInDom.length; i++) {
    if (stylesInDom[i].identifier === identifier) {
      result = i
      break
    }
  }

  return result
}

function modulesToDom(list: any, options: any) {
  const idCountMap: any = {}
  const identifiers = []

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    const id = options.base ? item[0] + options.base : item[0]
    const count = idCountMap[id] || 0
    const identifier = id + ' ' + count.toString()

    idCountMap[id] = count + 1

    const index = getIndexByIdentifier(identifier)
    const obj = {
      css: item[1],
      media: item[2],
      sourceMap: item[3],
    }

    if (index !== -1) {
      stylesInDom[index].references++
      stylesInDom[index].updater(obj)
    } else {
      stylesInDom.push({
        identifier: identifier,
        updater: addStyle(obj, options),
        references: 1,
      })
    }

    identifiers.push(identifier)
  }

  return identifiers
}

function insertStyleElement(options: any) {
  const style = document.createElement('style')
  const attributes = options.attributes || {}

  if (typeof attributes.nonce === 'undefined') {
    const nonce =
      typeof __webpack_nonce__ !== 'undefined' ? __webpack_nonce__ : null

    if (nonce) {
      attributes.nonce = nonce
    }
  }

  Object.keys(attributes).forEach(function (key) {
    style.setAttribute(key, attributes[key])
  })

  if (typeof options.insert === 'function') {
    options.insert(style)
  } else {
    const target = getTargetElement(options.insert || 'head')

    if (!target) {
      throw new Error(
        "Couldn't find a style target. This probably means that the value for the 'insert' parameter is invalid."
      )
    }

    target.appendChild(style)
  }

  return style
}

function removeStyleElement(style: any) {
  // istanbul ignore if
  if (style.parentNode === null) {
    return false
  }

  style.parentNode.removeChild(style)
}

/* istanbul ignore next  */
const replaceText = (function replaceText() {
  const textStore: any = []

  return function replace(index: any, replacement: any) {
    textStore[index] = replacement

    return textStore.filter(Boolean).join('\n')
  }
})()

function applyToSingletonTag(style: any, index: any, remove: any, obj: any) {
  const css = remove
    ? ''
    : obj.media
      ? '@media ' + obj.media + ' {' + obj.css + '}'
      : obj.css

  // For old IE
  /* istanbul ignore if  */
  if (style.styleSheet) {
    style.styleSheet.cssText = replaceText(index, css)
  } else {
    const cssNode = document.createTextNode(css)
    const childNodes = style.childNodes

    if (childNodes[index]) {
      style.removeChild(childNodes[index])
    }

    if (childNodes.length) {
      style.insertBefore(cssNode, childNodes[index])
    } else {
      style.appendChild(cssNode)
    }
  }
}

function applyToTag(style: any, _options: any, obj: any) {
  let css = obj.css
  const media = obj.media
  const sourceMap = obj.sourceMap

  if (media) {
    style.setAttribute('media', media)
  } else {
    style.removeAttribute('media')
  }

  if (sourceMap && typeof btoa !== 'undefined') {
    css +=
      '\n/*# sourceMappingURL=data:application/json;base64,' +
      btoa(unescape(encodeURIComponent(JSON.stringify(sourceMap)))) +
      ' */'
  }

  // For old IE
  /* istanbul ignore if  */
  if (style.styleSheet) {
    style.styleSheet.cssText = css
  } else {
    while (style.firstChild) {
      style.removeChild(style.firstChild)
    }

    style.appendChild(document.createTextNode(css))
  }
}

let singleton: any = null
let singletonCounter = 0

function addStyle(obj: any, options: any) {
  let style: any
  let update: any
  let remove: any

  if (options.singleton) {
    const styleIndex = singletonCounter++

    style = singleton || (singleton = insertStyleElement(options))

    update = applyToSingletonTag.bind(null, style, styleIndex, false)
    remove = applyToSingletonTag.bind(null, style, styleIndex, true)
  } else {
    style = insertStyleElement(options)

    update = applyToTag.bind(null, style, options)
    remove = function () {
      removeStyleElement(style)
    }
  }

  update(obj)

  return function updateStyle(newObj: any) {
    if (newObj) {
      if (
        newObj.css === obj.css &&
        newObj.media === obj.media &&
        newObj.sourceMap === obj.sourceMap
      ) {
        return
      }

      update((obj = newObj))
    } else {
      remove()
    }
  }
}

module.exports = function (list: any, options: any) {
  options = options || {}

  // Force single-tag solution on IE6-9, which has a hard limit on the # of <style>
  // tags it will allow on a page
  if (!options.singleton && typeof options.singleton !== 'boolean') {
    options.singleton = isOldIE()
  }

  list = list || []

  let lastIdentifiers = modulesToDom(list, options)

  return function update(newList: any) {
    newList = newList || []

    if (Object.prototype.toString.call(newList) !== '[object Array]') {
      return
    }

    for (let i = 0; i < lastIdentifiers.length; i++) {
      const identifier = lastIdentifiers[i]
      const index = getIndexByIdentifier(identifier)

      stylesInDom[index].references--
    }

    const newLastIdentifiers = modulesToDom(newList, options)

    for (let i = 0; i < lastIdentifiers.length; i++) {
      const identifier = lastIdentifiers[i]
      const index = getIndexByIdentifier(identifier)

      if (stylesInDom[index].references === 0) {
        stylesInDom[index].updater()
        stylesInDom.splice(index, 1)
      }
    }

    lastIdentifiers = newLastIdentifiers
  }
}
