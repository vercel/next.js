import React from 'react'
import { render } from 'react-dom'
import fetch from 'unfetch'

const attachToConsole = (type, callback) => {
  const orig = console[type]
  console[type] = function (...args) {
    callback(args)
    orig.apply(this, args)
  }
}

const getContainer = () => document.querySelector('#__next')
const initialHTML = getContainer().innerHTML

// attach to console.error to catch hydration error and provide better diff
attachToConsole('error', args => {
  if (!(args[0] || '').match(/did not match.*?Server/)) return

  const { router } = window.next
  const tmpContainer = document.createElement('div')
  const body = document.querySelector('body')
  tmpContainer.style.display = 'none'
  body.appendChild(tmpContainer)

  const {
    '/_app': { Component: App },
    [router.pathname]: { Component }
  } = router.components

  const showOverlay = diff => {
    const overlay = document.createElement('div')
    overlay.style.position = 'fixed'
    overlay.style.top = 0
    overlay.style.left = 0
    overlay.style.width = '100%'
    overlay.style.height = '100%'
    overlay.style.zIndex = 99999999
    overlay.style.overflow = 'auto'
    overlay.style.color = '#333333'
    overlay.style.background = '#ffffff'
    overlay.style.fontFamily = 'Consolas, Menlo, monospace'

    const wrapper = document.createElement('div')
    wrapper.style.top = 0
    wrapper.style.left = 0
    wrapper.style.right = 0
    wrapper.style.bottom = 0
    wrapper.style.width = 'calc(100% - 20px)'
    wrapper.style.margin = 'auto'
    wrapper.style.maxWidth = '1024px'
    wrapper.style.position = 'absolute'

    const close = document.createElement('span')
    close.innerHTML = '×'
    close.style.top = '25px'
    close.style.right = '15px'
    close.style.cursor = 'pointer'
    close.style.position = 'absolute'
    close.style.fontSize = '24px'
    close.title = 'Click or press escape to close'

    const closeOverlay = () => body.removeChild(overlay)
    close.addEventListener('click', closeOverlay)

    const header = document.createElement('div')
    header.innerText = 'Error: Client hydration mismatched server-side render'
    header.style.fontSize = '24px'
    header.style.fontFamily = 'sans-serif'
    header.style.color = 'rgb(206, 17, 38)'
    header.style.margin = '25px 0 0 0'

    const diffArea = document.createElement('div')
    diffArea.style.width = 'calc(100% - 10px)'
    diffArea.style.background = '#f2f3f4'
    diffArea.style.marginTop = '15px'
    diffArea.style.padding = '5px'
    diffArea.innerHTML = diff

    const postText = document.createElement('div')
    postText.style.fontSize = '14px'
    postText.style.margin = '10px 0'
    postText.style.color = 'rgb(135, 142, 145)'

    postText.innerHTML =
      '<p>Hydration errors can cause unintended side-effects since mismatches between the initial markup and the result from hydration are ignored in production</p>'
    postText.innerHTML +=
      '<p>This screen is visible only in development. It will not appear if this occurs in production</p>'

    wrapper.appendChild(close)
    wrapper.appendChild(header)
    wrapper.appendChild(diffArea)
    wrapper.appendChild(postText)
    overlay.appendChild(wrapper)

    body.addEventListener('keydown', event => {
      if (event.which === 27) closeOverlay()
    })
    body.appendChild(overlay)
  }

  const showDiff = async () => {
    const CSR_HTML = tmpContainer.innerHTML
    body.removeChild(tmpContainer)
    // showOverlay(diff)
    // throw new Error('idk')
    try {
      const res = await fetch('/_next/diffHandler', {
        method: 'POST',
        body: JSON.stringify({
          ssr: initialHTML,
          csr: CSR_HTML
        })
      })

      if (!res.ok) throw new Error('Got invalid response: ' + res.status)
      const { diff } = await res.json()
      showOverlay(diff)
    } catch (error) {
      console.warn(`Failed to provide deep diff for hydration mismatch`, error)
    }
  }

  const DiffContainer = ({ children }) => {
    React.useEffect(() => {
      // when the top-most container's useEffect is called
      // it should be finished rendering
      showDiff()
    })
    return children
  }

  // we have to use `render` since `renderToString` doesn't support `Suspense`
  render(
    React.createElement(
      DiffContainer,
      {},
      React.createElement(router._wrapApp(App), { router, Component })
    ),
    tmpContainer
  )
})
