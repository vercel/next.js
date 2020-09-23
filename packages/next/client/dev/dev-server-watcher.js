import { getEventSourceWrapper } from './error-overlay/eventsource'

export default function initializeDevServerWatcher() {
  const shadowHost = document.createElement('div')
  shadowHost.id = '__next-dev-server-watcher'
  // Make sure container is fixed and on a high zIndex so it shows
  shadowHost.style.position = 'fixed'
  shadowHost.style.top = '0'
  shadowHost.style.left = '0'
  shadowHost.style.width = '100%'
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
    prefix = '__next-dev-server-watcher-'
  }

  // Container
  const container = createContainer(prefix)
  shadowRoot.appendChild(container)

  // CSS
  const css = createCss(prefix)
  shadowRoot.appendChild(css)
  const closeEl = container.querySelector(`#${prefix}close`)

  // State
  let showBanner = false
  const dismissKey = '__NEXT_DISMISS_DEV_SERVER_INDICATOR'
  const dismissUntil = parseInt(window.localStorage.getItem(dismissKey), 10)
  const dismissed = dismissUntil > new Date().getTime()

  // Handle events
  const evtSource = getEventSourceWrapper({ path: '/_next/webpack-hmr' })

  evtSource.addConnectionListener((online) => {
    showBanner = !online
    updateContainer()
  })

  closeEl.addEventListener('click', () => {
    const oneHourAway = new Date().getTime() + 1 * 60 * 60 * 1000
    window.localStorage.setItem(dismissKey, oneHourAway + '')
    showBanner = false
    updateContainer()
  })

  function updateContainer() {
    if (showBanner && !dismissed) {
      container.classList.add(`${prefix}visible`)
    } else {
      container.classList.remove(`${prefix}visible`)
    }
  }
}

function createContainer(prefix) {
  const container = document.createElement('div')
  container.id = `${prefix}container`
  container.innerHTML = `
    <div id="${prefix}wrapper">
      <h1>Development server disconnected</h1>
      <button type="button" id="${prefix}close" title="Hide indicator for session">
        <span>×</span>
      </button>
    </div>
  `

  return container
}

function createCss(prefix) {
  const css = document.createElement('style')
  css.textContent = `
    #${prefix}container {
      position: absolute;
      top: 0;
      width: 100%;

      border-radius: 3px;
      background: #FDE8E8;
      color: #9B1C1C;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
      cursor: initial;
      letter-spacing: initial;
      text-shadow: initial;
      text-transform: initial;
      visibility: initial;

      padding: 16px 10px;
      align-items: center;
      box-shadow: 0 11px 40px 0 rgba(0, 0, 0, 0.25), 0 2px 10px 0 rgba(0, 0, 0, 0.12);

      display: none;
      opacity: 0;
      transition: opacity 0.1s ease, bottom 0.1s ease;
      animation: ${prefix}fade-in 0.1s ease-in-out;
    }

    #${prefix}container.${prefix}visible {
      display: flex;
      opacity: 1;
    }

    #${prefix}close {
      margin-right: 2rem;
      border: none;
      font-size: 32px;
      cursor: pointer;
      background: transparent;
      color: #9B1C1C;
    }

    #${prefix}wrapper {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }

    #${prefix}wrapper h1 {
      font-size: 1.25rem;
      margin: 0;
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
