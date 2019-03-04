import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'

export default function initializeBuildWatcher (webpackHMR) {
  const shadowHost = document.getElementById('__next-build-watcher')
  if (!shadowHost) return
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' })

  const reactRoot = document.createElement('div')
  reactRoot.setAttribute('id', 'react-root')

  shadowRoot.appendChild(reactRoot)
  ReactDOM.render(<BuildWatcher webpackHMR={webpackHMR} />, reactRoot)
}

function BuildWatcher ({ webpackHMR }) {
  const [isBuilding, setIsBuilding] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  let timeoutId = null

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
        timeoutId && clearTimeout(timeoutId)
        setIsBuilding(true)
        setIsVisible(true)
        break
      case 'built':
        setIsBuilding(false)
        // Remove from DOM after the fade out animation is complete
        timeoutId = setTimeout(() => setIsVisible(false), 100)
        break
    }
  }

  const style = document.getElementById('__next-build-watcher').getAttribute('buildwatcherstyle')

  return (
    <>
      {isVisible && (
        <div id='container' className={isBuilding ? 'building' : null}>
          <div id='icon-wrapper'>
            <svg
              width='114px'
              height='100px'
              viewBox='0 0 226 200'
              version='1.1'
              xmlns='http://www.w3.org/2000/svg'
            >
              <defs>
                <linearGradient
                  x1='114.720775%'
                  y1='181.283245%'
                  x2='39.5399306%'
                  y2='100%'
                  id='linearGradient-1'
                >
                  <stop stopColor='#FFFFFF' offset='0%' />
                  <stop stopColor='#000000' offset='100%' />
                </linearGradient>
              </defs>
              <g id='icon-group' fill='none' stroke='url(#linearGradient-1)' strokeWidth='18'>
                <path d='M113,5.08219117 L4.28393801,197.5 L221.716062,197.5 L113,5.08219117 Z' />
              </g>
            </svg>
          </div>

          <span>Building...</span>
        </div>
      )}

      <style jsx>{`
        #container {
          position: absolute;
          bottom: 10px;
          right: 30px;

          padding: 8px 10px;
          background: white;
          display: flex;
          align-items: center;
          box-shadow: 0 11px 40px 0 rgba(0, 0, 0, 0.38), 0 2px 10px 0 rgba(0, 0, 0, 0.48);

          overflow: hidden;
          opacity: 0;
          transition: opacity 0.1s ease, bottom 0.1s ease;
        }

        #container.building {
          bottom: 20px;
          opacity: 1;
        }

        #icon-wrapper {
          width: 16px;
          height: 16px;
        }

        #icon-wrapper > svg {
          width: 100%;
          height: 100%;
        }

        #container > span {
          font-family: monospace;
          margin-top: 2px;
          margin-left: 8px;
          display: ${style === 'minimalist' ? 'none' : 'unset'};
        }

        #icon-group {
          stroke-dasharray: 0 226;
          animation: strokedash 1s ease-in-out both infinite;
        }

        @keyframes strokedash {
          0% {
            stroke-dasharray: 0 226;
          }

          80%,
          100% {
            stroke-dasharray: 659 226;
          }
        }
      `}</style>
    </>
  )
}
