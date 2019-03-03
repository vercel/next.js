import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'

export default function initializeBuildWatcher (webpackHMR) {
  const shadowHost = document.getElementById('__next-build-watcher')
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' })

  const reactRoot = document.createElement('div')
  reactRoot.setAttribute('id', 'react-root')

  shadowRoot.appendChild(reactRoot)
  ReactDOM.render(<BuildWatcher webpackHMR={webpackHMR} />, reactRoot)
}

function BuildWatcher ({ webpackHMR }) {
  const [isBuilding, setIsBuilding] = useState(false)
  useEffect(() => {
    webpackHMR.addMessageListenerToEventSourceWrapper((event) => {
      // This is the heartbeat event
      if (event.data === '\uD83D\uDC93') {
        return
      }

      try {
        handleMessage(event)
      } catch { }
    })
  }, [])

  const handleMessage = (event) => {
    const obj = JSON.parse(event.data)

    switch (obj.action) {
      case 'building':
        setIsBuilding(true)
        break
      case 'built':
        setIsBuilding(false)
        break
    }
  }

  return (
    <div id='container' className={isBuilding ? 'visible' : null}>
      Building...

      <style jsx>{`
        #container {
          position: absolute;
          bottom: 10px;
          right: 10px;

          overflow: hidden;
          height: 0;
          opacity: 0;
          
          transition: opacity .1s ease;
        }

        #container.visible {
          opacity: 1;
          height: auto;
        }
      `}</style>
    </div>
  )
}
