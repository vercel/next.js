const DOMAttributeNames: Record<string, string> = {
  acceptCharset: 'accept-charset',
  className: 'class',
  htmlFor: 'for',
  httpEquiv: 'http-equiv',
  noModule: 'noModule',
}

const ignoreProps = [
  'onLoad',
  'onReady',
  'dangerouslySetInnerHTML',
  'children',
  'onError',
  'strategy',
  'stylesheets',
]

function isBooleanScriptAttribute(
  attr: string
): attr is 'async' | 'defer' | 'noModule' {
  return ['async', 'defer', 'noModule'].includes(attr)
}

export function setAttributesFromProps(el: HTMLElement, props: object) {
  for (const [p, value] of Object.entries(props)) {
    if (!props.hasOwnProperty(p)) continue
    if (ignoreProps.includes(p)) continue

    // we don't render undefined props to the DOM
    if (value === undefined) {
      continue
    }

    const attr = DOMAttributeNames[p] || p.toLowerCase()

    if (el.tagName === 'SCRIPT' && isBooleanScriptAttribute(attr)) {
      // Correctly assign boolean script attributes
      // https://github.com/vercel/next.js/pull/20748
      ;(el as HTMLScriptElement)[attr] = !!value
    } else {
      el.setAttribute(attr, String(value))
    }

    // Remove falsy non-zero boolean attributes so they are correctly interpreted
    // (e.g. if we set them to false, this coerces to the string "false", which the browser interprets as true)
    if (
      value === false ||
      (el.tagName === 'SCRIPT' &&
        isBooleanScriptAttribute(attr) &&
        (!value || value === 'false'))
    ) {
      // Call setAttribute before, as we need to set and unset the attribute to override force async:
      // https://html.spec.whatwg.org/multipage/scripting.html#script-force-async
      el.setAttribute(attr, '')
      el.removeAttribute(attr)
    }
  }
}
