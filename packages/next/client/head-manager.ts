import ReactDOMServer from 'react-dom/server'

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
    el.setAttribute('data-next-head', true)
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
  const headCountEls = headEl.querySelectorAll('[data-next-head=true]')

  headCountEls.forEach((el) => {
    if (el!.tagName.toLowerCase() === type) {
      headEl.removeChild(el)
    }
  })

  components.forEach((c) => {
    headEl.appendChild(reactElementToDOM(c))
  })
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
          // handle react components
          if (typeof h.type === 'function') {
            // TODO half baked idea, not working
            const headEl = document.getElementsByTagName('head')[0]
            const elStr = ReactDOMServer.renderToStaticMarkup(h)
            headEl.innerHTML = elStr
          } else {
            const components = tags[h.type] || []
            components.push(h)
            tags[h.type] = components
          }
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
