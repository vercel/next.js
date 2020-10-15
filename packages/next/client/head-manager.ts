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
    el.textContent =
      typeof children === 'string'
        ? children
        : Array.isArray(children)
        ? children.join('')
        : ''
  }
  return el
}

function updateElements(
  elements: Element[],
  components: JSX.Element[],
  removeOldTags: boolean
) {
  const headEl = document.getElementsByTagName('head')[0]
  const oldIndices: number[] = []

  components.forEach((tag) => {
    if (tag.type === 'title') {
      let title = ''
      if (tag) {
        const { children } = tag.props
        title =
          typeof children === 'string'
            ? children
            : Array.isArray(children)
            ? children.join('')
            : ''
      }
      if (title !== document.title) document.title = title
      return
    }

    const newTag = reactElementToDOM(tag)
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].isEqualNode(newTag)) {
        oldIndices.push(i)
        // Keep scanning in case there are multiple matching instances
        continue
      }
    }

    elements.push(newTag)
    headEl.appendChild(newTag)
  })

  // Sort in reverse order so we can remove from back to front
  oldIndices
    .sort((a, b) => b - a)
    .forEach((oldIndex) => {
      if (removeOldTags) {
        const oldTag = elements[oldIndex]
        oldTag.parentNode!.removeChild(oldTag)
      }
      elements.splice(oldIndex, 1)
    })
}

export default function initHeadManager(initialHeadEntries: HeadEntry[]) {
  const headEl = document.getElementsByTagName('head')[0]
  const elements = Array.prototype.concat.call([], headEl.children)

  updateElements(
    elements,
    initialHeadEntries.map(([type, props]) => createElement(type, props)),
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
