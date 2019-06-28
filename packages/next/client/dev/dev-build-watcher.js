import { getEventSourceWrapper } from './error-overlay/eventsource'

export default function initializeBuildWatcher () {
  const shadowHost = document.createElement('div')
  shadowHost.id = '__next-build-watcher'
  // Make sure container is fixed and on a high zIndex so it shows
  shadowHost.style.position = 'fixed'
  shadowHost.style.bottom = '10px'
  shadowHost.style.right = '10px'
  shadowHost.style.width = 0
  shadowHost.style.height = 0
  shadowHost.style.zIndex = 99999
  document.body.appendChild(shadowHost)

  let shadowRoot
  let prefix = ''

  if (shadowHost.attachShadow) {
    shadowRoot = shadowHost.attachShadow({ mode: 'open' })
  } else {
    // If attachShadow is undefined then the browser does not support
    // the Shadow DOM, we need to prefix all the names so there
    // will be no conflicts
    shadowRoot = shadowHost
    prefix = '__next-build-watcher-'
  }

  // Container
  const container = createContainer(prefix)
  shadowRoot.appendChild(container)

  // CSS
  const css = createCss(prefix)
  shadowRoot.appendChild(css)

  // State
  let isVisible = false
  let isBuilding = false
  let timeoutId = null

  // Handle events
  const evtSource = getEventSourceWrapper({ path: '/_next/webpack-hmr' })
  evtSource.addMessageListener(event => {
    // This is the heartbeat event
    if (event.data === '\uD83D\uDC93') {
      return
    }

    try {
      handleMessage(event)
    } catch {}
  })

  function handleMessage (event) {
    const obj = JSON.parse(event.data)

    switch (obj.action) {
      case 'building':
        timeoutId && clearTimeout(timeoutId)
        isVisible = true
        isBuilding = true
        updateContainer()
        break
      case 'built':
        isBuilding = false
        // Wait for the fade out transtion to complete
        timeoutId = setTimeout(() => {
          isVisible = false
          updateContainer()
        }, 100)
        updateContainer()
        break
    }
  }

  function updateContainer () {
    if (isBuilding) {
      container.classList.add(`${prefix}building`)
    } else {
      container.classList.remove(`${prefix}building`)
    }

    if (isVisible) {
      container.classList.add(`${prefix}visible`)
    } else {
      container.classList.remove(`${prefix}visible`)
    }
  }
}

function createContainer (prefix) {
  const container = document.createElement('div')
  container.id = `${prefix}container`
  container.innerHTML = `
    <div id="${prefix}icon-wrapper">
      <svg viewBox="0 0 226 200">
        <defs>
          <linearGradient
            x1="114.720775%"
            y1="181.283245%"
            x2="39.5399306%"
            y2="100%"
            id="${prefix}linear-gradient"
          >
            <stop stop-color="#FFFFFF" offset="0%" />
            <stop stop-color="#000000" offset="100%" />
          </linearGradient>
        </defs>
        <g id="${prefix}icon-group" fill="none" stroke="url(#${prefix}linear-gradient)" stroke-width="18">
          <path d="M113,5.08219117 L4.28393801,197.5 L221.716062,197.5 L113,5.08219117 Z" />
        </g>
      </svg>
    </div>
  `

  return container
}

function createCss (prefix) {
  const css = document.createElement('style')
  css.textContent = `
    #${prefix}container {
      position: absolute;
      bottom: 10px;
      right: 30px;

      background: #fff;
      color: #000;
      font: initial;
      cursor: initial;
      letter-spacing: initial;
      text-shadow: initial;
      text-transform: initial;
      visibility: initial;

      padding: 8px 10px;
      align-items: center;
      box-shadow: 0 11px 40px 0 rgba(0, 0, 0, 0.25), 0 2px 10px 0 rgba(0, 0, 0, 0.12);

      display: none;
      opacity: 0;
      transition: opacity 0.1s ease, bottom 0.1s ease;
      animation: ${prefix}fade-in 0.1s ease-in-out;
    }

    #${prefix}container.${prefix}visible {
      display: flex;
    }

    #${prefix}container.${prefix}building {
      bottom: 20px;
      opacity: 1;
    }

    #${prefix}icon-wrapper {
      width: 16px;
      height: 16px;
    }

    #${prefix}icon-wrapper > svg {
      width: 100%;
      height: 100%;
    }

    #${prefix}icon-group {
      animation: ${prefix}strokedash 1s ease-in-out both infinite;
    }

    @keyframes ${prefix}fade-in {
      from {
        bottom: 10px;
        opacity: 0;
      }
      to {
        bottom: 20px;
        opacity: 1;
      }
    }

    @keyframes ${prefix}strokedash {
      0% {
        stroke-dasharray: 0 226;
      }
      80%,
      100% {
        stroke-dasharray: 659 226;
      }
    }
  `

  return css
}
