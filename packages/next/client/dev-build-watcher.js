export default function initializeBuildWatcher (webpackHMR) {
  const shadowHost = document.getElementById('__next-build-watcher')
  if (!shadowHost) return
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' })

  // Get the current style
  const style = shadowHost.getAttribute('buildwatcherstyle')

  // Container
  const container = createContainer()
  shadowRoot.appendChild(container)

  // CSS
  const css = createCss(style)
  shadowRoot.appendChild(css)

  // State
  let isVisible = false
  let isBuilding = false
  let timeoutId = null

  // Handle events
  webpackHMR.addMessageListenerToEventSourceWrapper((event) => {
    // This is the heartbeat event
    if (event.data === '\uD83D\uDC93') {
      return
    }

    try {
      handleMessage(event)
    } catch { }
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
      container.classList.add('building')
    } else {
      container.classList.remove('building')
    }

    if (isVisible) {
      container.classList.add('visible')
    } else {
      container.classList.remove('visible')
    }
  }
}

function createContainer () {
  const container = document.createElement('div')
  container.setAttribute('id', 'container')
  container.innerHTML = `
    <div id="icon-wrapper">
      <svg
        width="114px"
        height="100px"
        viewBox="0 0 226 200"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            x1="114.720775%"
            y1="181.283245%"
            x2="39.5399306%"
            y2="100%"
            id="linearGradient-1"
          >
            <stop stop-color="#FFFFFF" offset="0%" />
            <stop stop-color="#000000" offset="100%" />
          </linearGradient>
        </defs>
        <g id="icon-group" fill="none" stroke="url(#linearGradient-1)" stroke-width="18">
          <path d="M113,5.08219117 L4.28393801,197.5 L221.716062,197.5 L113,5.08219117 Z" />
        </g>
      </svg>
    </div>

    <span id="building-text"></span>
  `

  return container
}

function createCss (style) {
  const css = document.createElement('style')
  css.innerHTML = `
    #container {
      position: absolute;
      bottom: 10px;
      right: 30px;

      padding: 8px 10px;
      background: white;
      align-items: center;
      box-shadow: 0 11px 40px 0 rgba(0, 0, 0, 0.38), 0 2px 10px 0 rgba(0, 0, 0, 0.48);

      display: none;
      opacity: 0;
      transition: opacity 0.1s ease, bottom 0.1s ease;
      animation: fade-in 0.1s ease-in-out;
    }

    #container.visible {
      display: flex;
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

    #building-text {
      font-family: monospace;
      margin-top: 2px;
      margin-left: 8px;
      display: ${style === 'minimalist' ? 'none' : 'unset'};
    }

    #building-text::after {
      content: 'Building...';
    }

    #icon-group {
      stroke-dasharray: 0 226;
      animation: strokedash 1s ease-in-out both infinite;
    }

    @keyframes fade-in {
      from {
        bottom: 10px;
        opacity: 0;
      }
      to {
        bottom: 20px;
        opacity: 1;
      }
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
  `

  return css
}
