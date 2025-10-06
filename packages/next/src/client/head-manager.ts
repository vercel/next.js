import { setAttributesFromProps } from './set-attributes-from-props'

import type { JSX } from 'react'

function reactElementToDOM({ type, props }: JSX.Element): HTMLElement {
  const el: HTMLElement = document.createElement(type)
  setAttributesFromProps(el, props)

  const { children, dangerouslySetInnerHTML } = props
  if (dangerouslySetInnerHTML) {
    el.innerHTML = dangerouslySetInnerHTML.__html || ''
  } else if (children) {
    el.textContent =
      typeof children === 'string'
        ? children
        : Array.isArray(children)
          ? children.join('')
          : ''
  }
  return el
}

/**
 * When a `nonce` is present on an element, browsers such as Chrome and Firefox strip it out of the
 * actual HTML attributes for security reasons *when the element is added to the document*. Thus,
 * given two equivalent elements that have nonces, `Element,isEqualNode()` will return false if one
 * of those elements gets added to the document. Although the `element.nonce` property will be the
 * same for both elements, the one that was added to the document will return an empty string for
 * its nonce HTML attribute value.
 *
 * This custom `isEqualNode()` function therefore removes the nonce value from the `newTag` before
 * comparing it to `oldTag`, restoring it afterwards.
 *
 * For more information, see:
 * https://bugs.chromium.org/p/chromium/issues/detail?id=1211471#c12
 */
export function isEqualNode(oldTag: Element, newTag: Element) {
  if (oldTag instanceof HTMLElement && newTag instanceof HTMLElement) {
    const nonce = newTag.getAttribute('nonce')
    // Only strip the nonce if `oldTag` has had it stripped. An element's nonce attribute will not
    // be stripped if there is no content security policy response header that includes a nonce.
    if (nonce && !oldTag.getAttribute('nonce')) {
      const cloneTag = newTag.cloneNode(true) as typeof newTag
      cloneTag.setAttribute('nonce', '')
      cloneTag.nonce = nonce
      return nonce === oldTag.nonce && oldTag.isEqualNode(cloneTag)
    }
  }

  return oldTag.isEqualNode(newTag)
}

function updateElements(type: string, components: JSX.Element[]) {
  const headEl = document.querySelector('head')
  if (!headEl) return

  const oldTags = new Set(headEl.querySelectorAll(`${type}[data-next-head]`))

  if (type === 'meta') {
    const metaCharset = headEl.querySelector('meta[charset]')
    if (metaCharset !== null) {
      oldTags.add(metaCharset)
    }
  }

  const newTags: Element[] = []
  for (let i = 0; i < components.length; i++) {
    const component = components[i]
    const newTag = reactElementToDOM(component)
    newTag.setAttribute('data-next-head', '')

    let isNew = true
    for (const oldTag of oldTags) {
      if (isEqualNode(oldTag, newTag)) {
        oldTags.delete(oldTag)
        isNew = false
        break
      }
    }

    if (isNew) {
      newTags.push(newTag)
    }
  }

  for (const oldTag of oldTags) {
    oldTag.parentNode?.removeChild(oldTag)
  }

  for (const newTag of newTags) {
    // meta[charset] must be first element so special case
    if (
      newTag.tagName.toLowerCase() === 'meta' &&
      newTag.getAttribute('charset') !== null
    ) {
      headEl.prepend(newTag)
    }
    headEl.appendChild(newTag)
  }
}

export default function initHeadManager(): {
  mountedInstances: Set<unknown>
  updateHead: (head: JSX.Element[]) => void
} {
  return {
    mountedInstances: new Set(),
    updateHead: (head: JSX.Element[]) => {
      const tags: Record<string, JSX.Element[]> = {}

      head.forEach((h) => {
        if (
          // If the font tag is loaded only on client navigation
          // it won't be inlined. In this case revert to the original behavior
          h.type === 'link' &&
          h.props['data-optimized-fonts']
        ) {
          if (
            document.querySelector(`style[data-href="${h.props['data-href']}"]`)
          ) {
            return
          } else {
            h.props.href = h.props['data-href']
            h.props['data-href'] = undefined
          }
        }

        const components = tags[h.type] || []
        components.push(h)
        tags[h.type] = components
      })

      const titleComponent = tags.title ? tags.title[0] : null
      let title = ''
      if (titleComponent) {
        const { children } = titleComponent.props
        title =
          typeof children === 'string'
            ? children
            : Array.isArray(children)
              ? children.join('')
              : ''
      }
      if (title !== document.title) document.title = title
      ;['meta', 'base', 'link', 'style', 'script'].forEach((type) => {
        updateElements(type, tags[type] || [])
      })
    },
  }
}
