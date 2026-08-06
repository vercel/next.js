/// <reference types="webpack/module.d.ts" />

const getTarget = (() => {
  const memo: any = {}

  return function memorize(target: any) {
    if (typeof memo[target] === 'undefined') {
      let styleTarget = document.querySelector(target)

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

module.exports = (url: any, options: any) => {
  options = options || {}
  options.attributes =
    typeof options.attributes === 'object' ? options.attributes : {}

  if (typeof options.attributes.nonce === 'undefined') {
    const nonce =
      typeof __webpack_nonce__ !== 'undefined' ? __webpack_nonce__ : null

    if (nonce) {
      options.attributes.nonce = nonce
    }
  }

  const link = document.createElement('link')

  link.rel = 'stylesheet'
  link.href = url

  Object.keys(options.attributes).forEach((key) => {
    link.setAttribute(key, options.attributes[key])
  })

  if (typeof options.insert === 'function') {
    options.insert(link)
  } else {
    const target = getTarget(options.insert || 'head')

    if (!target) {
      throw new Error(
        "Couldn't find a style target. This probably means that the value for the 'insert' parameter is invalid."
      )
    }

    target.appendChild(link)
  }

  return (newUrl: any) => {
    if (typeof newUrl === 'string') {
      link.href = newUrl
    } else {
      link.parentNode!.removeChild(link)
    }
  }
}
