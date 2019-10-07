import Router from '../router'

export default function initializeBuildWatcher () {
  const shadowHost = document.createElement('div')
  shadowHost.id = '__next-prerender-indicator'
  // Make sure container is fixed and on a high zIndex so it shows
  shadowHost.style.position = 'fixed'
  shadowHost.style.bottom = '20px'
  shadowHost.style.right = '10px'
  shadowHost.style.width = 0
  shadowHost.style.height = 0
  shadowHost.style.zIndex = 99998
  shadowHost.style.transition = 'all 100ms ease'

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
    prefix = '__next-prerender-indicator-'
  }

  // Container
  const container = createContainer(prefix)
  shadowRoot.appendChild(container)

  // CSS
  const css = createCss(prefix)
  shadowRoot.appendChild(css)

  const expandEl = container.querySelector('a')
  const closeEl = container.querySelector(`#${prefix}close`)

  // State
  const dismissKey = '__NEXT_DISMISS_PRERENDER_INDICATOR'
  const dismissUntil = parseInt(window.localStorage.getItem(dismissKey), 10)
  const dismissed = dismissUntil > new Date().getTime()

  let isVisible = !dismissed && window.__NEXT_DATA__.nextExport

  function updateContainer () {
    if (isVisible) {
      container.classList.add(`${prefix}visible`)
    } else {
      container.classList.remove(`${prefix}visible`)
    }
  }
  const expandedClass = `${prefix}expanded`
  let toggleTimeout

  const toggleExpand = (expand = true) => {
    clearTimeout(toggleTimeout)

    toggleTimeout = setTimeout(() => {
      if (expand) {
        expandEl.classList.add(expandedClass)
        closeEl.style.display = 'flex'
      } else {
        expandEl.classList.remove(expandedClass)
        closeEl.style.display = 'none'
      }
    }, 50)
  }

  closeEl.addEventListener('click', () => {
    const oneHourAway = new Date().getTime() + 1 * 60 * 60 * 1000
    window.localStorage.setItem(dismissKey, oneHourAway + '')
    isVisible = false
    updateContainer()
  })
  closeEl.addEventListener('mouseenter', () => toggleExpand())
  closeEl.addEventListener('mouseleave', () => toggleExpand(false))
  expandEl.addEventListener('mouseenter', () => toggleExpand())
  expandEl.addEventListener('mouseleave', () => toggleExpand(false))

  Router.events.on('routeChangeComplete', () => {
    isVisible = window.next.isPrerendered
    updateContainer()
  })
  updateContainer()
}

function createContainer (prefix) {
  const container = document.createElement('div')
  container.id = `${prefix}container`
  container.innerHTML = `
    <button id="${prefix}close" title="Hide indicator for session">
      <span>×</span>
    </button>
    <a href="https://nextjs.org/docs#automatic-static-optimization-indicator" target="_blank">
      <div id="${prefix}icon-wrapper">
          <svg width="15" height="20" viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M36 3L30.74 41H8L36 3Z" fill="black"/>
          <path d="M25 77L30.26 39H53L25 77Z" fill="black"/>
          <path d="M13.5 33.5L53 39L47.5 46.5L7 41.25L13.5 33.5Z" fill="black"/>
          </svg>
          Prerendered Page
      </div>
    </a>
  `
  return container
}

function createCss (prefix) {
  const css = document.createElement('style')
  css.textContent = `
    #${prefix}container {
      position: absolute;
      display: none;
      bottom: 10px;
      right: 15px;
    }

    #${prefix}close {
      top: -10px;
      right: -10px;
      border: none;
      width: 18px;
      height: 18px;
      color: #333333;
      font-size: 16px;
      cursor: pointer;
      display: none;
      position: absolute;
      background: #ffffff;
      border-radius: 100%;
      align-items: center;
      flex-direction: column;
      justify-content: center;
    }

    #${prefix}container a {
      color: inherit;
      text-decoration: none;
      width: 15px;
      height: 23px;
      overflow: hidden;

      border-radius: 3px;
      background: #fff;
      color: #000;
      font: initial;
      cursor: pointer;
      letter-spacing: initial;
      text-shadow: initial;
      text-transform: initial;
      visibility: initial;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;

      padding: 4px 2px;
      align-items: center;
      box-shadow: 0 11px 40px 0 rgba(0, 0, 0, 0.25), 0 2px 10px 0 rgba(0, 0, 0, 0.12);

      display: flex;
      transition: opacity 0.1s ease, bottom 0.1s ease, width 0.3s ease;
      animation: ${prefix}fade-in 0.1s ease-in-out;
    }

    #${prefix}icon-wrapper {
      width: 140px;
      height: 20px;
      display: flex;
      flex-shrink: 0;
      align-items: center;
      position: relative;
    }

    #${prefix}icon-wrapper svg {
      flex-shrink: 0;
      margin-right: 3px;
    }

    #${prefix}container a.${prefix}expanded {
      width: 135px;
    }

    #${prefix}container.${prefix}visible {
      display: flex;
      bottom: 10px;
      opacity: 1;
    }

    @keyframes ${prefix}fade-in {
      from {
        bottom: 0px;
        opacity: 0;
      }
      to {
        bottom: 10px;
        opacity: 1;
      }
    }
  `

  return css
}
