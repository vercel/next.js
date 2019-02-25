import { format } from 'url'

export function execOnce (fn) {
  let used = false
  return (...args) => {
    if (!used) {
      used = true
      fn.apply(this, args)
    }
  }
}

export function getLocationOrigin () {
  const { protocol, hostname, port } = window.location
  return `${protocol}//${hostname}${port ? ':' + port : ''}`
}

export function getURL () {
  const { href } = window.location
  const origin = getLocationOrigin()
  return href.substring(origin.length)
}

export function getDisplayName (Component) {
  if (typeof Component === 'string') {
    return Component
  }

  return Component.displayName || Component.name || 'Unknown'
}

export function isResSent (res) {
  return res.finished || res.headersSent
}

export async function loadGetInitialProps (Component, ctx) {
  if (process.env.NODE_ENV !== 'production') {
    if (Component.prototype && Component.prototype.getInitialProps) {
      const message = `"${getDisplayName(Component)}.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-initial-props-as-an-instance-method for more information.`
      throw new Error(message)
    }
  }

  if (!Component.getInitialProps) return {}

  const props = await Component.getInitialProps(ctx)

  if (ctx.res && isResSent(ctx.res)) {
    return props
  }

  if (!props) {
    const message = `"${getDisplayName(Component)}.getInitialProps()" should resolve to an object. But found "${props}" instead.`
    throw new Error(message)
  }

  return props
}

export const urlObjectKeys = ['auth', 'hash', 'host', 'hostname', 'href', 'path', 'pathname', 'port', 'protocol', 'query', 'search', 'slashes']

export function formatWithValidation (url, options) {
  if (process.env.NODE_ENV === 'development') {
    if (url !== null && typeof url === 'object') {
      Object.keys(url).forEach((key) => {
        if (urlObjectKeys.indexOf(key) === -1) {
          console.warn(`Unknown key passed via urlObject into url.format: ${key}`)
        }
      })
    }
  }

  return format(url, options)
}
