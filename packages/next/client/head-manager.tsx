import React from 'react'
import ReactDOMServer from 'react-dom/server'

export default function initHeadManager() {
  let updatePromise: Promise<void> | null = null

  return {
    mountedInstances: new Set(),
    updateHead: (head: JSX.Element[]) => {
      const promise = (updatePromise = Promise.resolve().then(() => {
        if (promise !== updatePromise) return
        updatePromise = null
        const headAsMarkup = ReactDOMServer.renderToStaticMarkup(
          <React.Fragment>{head}</React.Fragment>
        )
        const headEl = document.getElementsByTagName('head')[0]
        headEl.innerHTML = headAsMarkup
      }))
    },
  }
}
