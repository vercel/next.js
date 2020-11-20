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

function updateElements(type: string, components: JSX.Element[]) {
  const headEl = document.getElementsByTagName('head')[0]
  const headCountEl: HTMLMetaElement = headEl.querySelector(
    'meta[name=next-head-count]'
  ) as HTMLMetaElement
  if (process.env.NODE_ENV !== 'production') {
    if (!headCountEl) {
      console.error(
        'Warning: next-head-count is missing. https://err.sh/next.js/next-head-count-missing'
      )
      return
    }
  }

  const headCount = Number(headCountEl.content)
  const oldTags: Element[] = []

  for (
    let i = 0, j = headCountEl.previousElementSibling;
    i < headCount;
    i++, j = j!.previousElementSibling
  ) {
    if (j!.tagName.toLowerCase() === type) {
      oldTags.push(j!)
    }
  }
  const newTags = (components.map(reactElementToDOM) as HTMLElement[]).filter(
    (newTag) => {
      for (let k = 0, len = oldTags.length; k < len; k++) {
        const oldTag = oldTags[k]
        if (oldTag.isEqualNode(newTag)) {
          oldTags.splice(k, 1)
          return false
        }
      }
      return true
    }
  )

  oldTags.forEach((t) => t.parentNode!.removeChild(t))
  newTags.forEach((t) => headEl.insertBefore(t, headCountEl))
  headCountEl.content = (headCount - oldTags.length + newTags.length).toString()
}

export default function initHeadManager() {
  let updatePromise: Promise<void> | null = null

  return {
    mountedInstances: new Set(),
    updateHead: (head: JSX.Element[]) => {
      const promise = (updatePromise = Promise.resolve().then(() => {
        if (promise !== updatePromise) return

        updatePromise = null
        const tags: Record<string, JSX.Element[]> = {}

        head.forEach((h) => {
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
      }))
    },
  }
}
