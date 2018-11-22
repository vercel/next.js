
const DOMAttributeNames = {
  acceptCharset: 'accept-charset',
  className: 'class',
  htmlFor: 'for',
  httpEquiv: 'http-equiv'
}

let updatePromise

export function updateHead (head) {
  const promise = updatePromise = Promise.resolve().then(() => {
    if (promise !== updatePromise) return
    updatePromise = null

    const tags = {}
    head.forEach((h) => {
      const components = tags[h.type] || []
      components.push(h)
      tags[h.type] = components
    })

    updateTitle(tags.title && tags.title[0])

    ;['meta', 'base', 'link', 'style', 'script'].forEach((type) => {
      updateElements(type, tags[type] || [])
    })
  })
}

function updateTitle (component) {
  let title
  if (component) {
    const { children } = component.props
    title = typeof children === 'string' ? children : children.join('')
  } else {
    title = ''
  }
  if (title !== document.title) document.title = title
}
function updateElements (type, components) {
  const headEl = document.getElementsByTagName('head')[0]
  const oldTags = Array.prototype.slice.call(headEl.querySelectorAll(type + '.next-head'))
  const newTags = components.map(reactElementToDOM).filter((newTag) => {
    for (let i = 0, len = oldTags.length; i < len; i++) {
      const oldTag = oldTags[i]
      if (oldTag.isEqualNode(newTag)) {
        oldTags.splice(i, 1)
        return false
      }
    }
    return true
  })

  oldTags.forEach((t) => t.parentNode.removeChild(t))
  newTags.forEach((t) => headEl.appendChild(t))
}

function reactElementToDOM ({ type, props }) {
  const el = document.createElement(type)
  for (const p in props) {
    if (!props.hasOwnProperty(p)) continue
    if (p === 'children' || p === 'dangerouslySetInnerHTML') continue

    const attr = DOMAttributeNames[p] || p.toLowerCase()
    el.setAttribute(attr, props[p])
  }

  const { children, dangerouslySetInnerHTML } = props
  if (dangerouslySetInnerHTML) {
    el.innerHTML = dangerouslySetInnerHTML.__html || ''
  } else if (children) {
    el.textContent = typeof children === 'string' ? children : children.join('')
  }
  return el
}
