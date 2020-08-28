import { createElement } from 'react'
import { HeadEntry } from '../next-server/lib/utils'

const DOMAttributeNames: Record<string, string> = {
  acceptCharset: 'accept-charset',
  className: 'class',
  htmlFor: 'for',
  httpEquiv: 'http-equiv',
}

function reactElementToDOM({ type, props }: JSX.Element): HTMLElement {
  const el = document.createElement(type)
  for (const p in props) {
    if (!props.hasOwnProperty(p)) continue
    if (p === 'children' || p === 'dangerouslySetInnerHTML') continue

    // we don't render undefined props to the DOM
    if (props[p] === undefined) continue

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

function updateElements(
  elements: Set<Element>,
  components: JSX.Element[],
  removeOldTags: boolean
) {
  const headEl = document.getElementsByTagName('head')[0]
  const oldTags = new Set(elements)

  components.forEach((tag) => {
    if (tag.type === 'title') {
      let title = ''
      if (tag) {
        const { children } = tag.props
        title = typeof children === 'string' ? children : children.join('')
      }
      if (title !== document.title) document.title = title
      return
    }

    const newTag = reactElementToDOM(tag)
    for (const oldTag of elements) {
      if (oldTag.isEqualNode(newTag)) {
        oldTags.delete(oldTag)
        return
      }
    }

    elements.add(newTag)
    headEl.appendChild(newTag)
  })

  for (const oldTag of oldTags) {
    if (removeOldTags) {
      oldTag.parentNode!.removeChild(oldTag)
    }
    elements.delete(oldTag)
  }
}

export default function initHeadManager(initialHeadEntries: HeadEntry[]) {
  const headEl = document.getElementsByTagName('head')[0]
  const elements = new Set<Element>(headEl.children)

  updateElements(
    elements,
    initialHeadEntries.map((entry) => createElement(entry.type, entry.props)),
    false
  )

  let updatePromise: Promise<void> | null = null

  return {
    mountedInstances: new Set(),
    updateHead: (head: JSX.Element[]) => {
      const promise = (updatePromise = Promise.resolve().then(() => {
        if (promise !== updatePromise) return

        updatePromise = null
        updateElements(elements, head, true)
      }))
    },
  }
}
